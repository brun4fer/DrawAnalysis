import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Agent, request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";

const REGION = "auto";
const SERVICE = "s3";

type QueryEntry = [string, string];
type CompletedPart = { partNumber: number; etag: string; size?: number };

let windowsHttpsAgent: Agent | null = null;

function pemCertificate(base64: string) {
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}
function trustedWindowsAgent() {
  if (windowsHttpsAgent) return windowsHttpsAgent;
  const command = "$ErrorActionPreference='Stop'; Get-ChildItem Cert:\\CurrentUser\\Root,Cert:\\LocalMachine\\Root | ForEach-Object { [Convert]::ToBase64String($_.RawData) }";
  const certificates = execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  }).split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map(pemCertificate);
  windowsHttpsAgent = new Agent({ ca: [...rootCertificates, ...certificates] });
  return windowsHttpsAgent;
}

function windowsSystemFetch(url: string, method: string, headers: Headers, body?: string) {
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method,
      headers: Object.fromEntries(headers.entries()),
      agent: trustedWindowsAgent(),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        const responseHeaders = new Headers();
        Object.entries(response.headers).forEach(([name, value]) => {
          if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
          else if (value !== undefined) responseHeaders.set(name, String(value));
        });
        const status = response.statusCode ?? 500;
        const responseBody = method === "HEAD" || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
        resolve(new Response(responseBody, {
          status,
          statusText: response.statusMessage,
          headers: responseHeaders,
        }));
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function config() {
  const endpoint = required("MEDIA_R2_ENDPOINT").replace(/\/+$/, "");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") throw new Error("MEDIA_R2_ENDPOINT deve usar HTTPS.");
  return {
    endpoint,
    bucket: required("MEDIA_R2_BUCKET_NAME"),
    accessKeyId: required("MEDIA_R2_ACCESS_KEY_ID"),
    secretAccessKey: required("MEDIA_R2_SECRET_ACCESS_KEY"),
  };
}

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function objectPath(bucket: string, key: string) {
  return `/${encode(bucket)}/${key.split("/").map(encode).join("/")}`;
}

function canonicalQuery(entries: QueryEntry[]) {
  return entries.map(([key, value]) => [encode(key), encode(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      if (aValue !== bValue) return aValue < bValue ? -1 : 1;
      return 0;
    })
    .map(([key, value]) => `${key}=${value}`).join("&");
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret: string, date: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function timestamps(now = new Date()) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, date: amzDate.slice(0, 8) };
}

function signature(method: string, path: string, query: QueryEntry[], headers: Record<string, string>, payloadHash: string, amzDate: string, date: string, secret: string) {
  const normalized = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = normalized.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = normalized.map(([name]) => name).join(";");
  const canonicalRequest = [method, path, canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n");
  return {
    signedHeaders,
    scope,
    value: createHmac("sha256", signingKey(secret, date)).update(stringToSign).digest("hex"),
  };
}

async function signedRequest(method: string, key: string, query: QueryEntry[] = [], body = "", extraHeaders: Record<string, string> = {}) {
  const settings = config();
  const path = objectPath(settings.bucket, key);
  const { amzDate, date } = timestamps();
  const payloadHash = hash(body);
  const host = new URL(settings.endpoint).host;
  const signingHeaders = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...extraHeaders };
  const signed = signature(method, path, query, signingHeaders, payloadHash, amzDate, date, settings.secretAccessKey);
  const headers = new Headers(extraHeaders);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);
  headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${settings.accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.value}`);
  const url = `${settings.endpoint}${path}${query.length ? `?${canonicalQuery(query)}` : ""}`;
  const response = process.platform === "win32"
    ? await windowsSystemFetch(url, method, headers, body || undefined)
    : await fetch(url, { method, headers, body: body || undefined, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.text();
    const message = xmlValue(payload, "Message") || payload.slice(0, 300) || response.statusText;
    throw new Error(`Cloudflare R2 devolveu ${response.status}: ${message}`);
  }
  return response;
}

function presignedUrl(method: string, key: string, query: QueryEntry[], expiresSeconds: number) {
  const settings = config();
  const path = objectPath(settings.bucket, key);
  const host = new URL(settings.endpoint).host;
  const { amzDate, date } = timestamps();
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const signedQuery: QueryEntry[] = [
    ...query,
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${settings.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const signed = signature(method, path, signedQuery, { host }, "UNSIGNED-PAYLOAD", amzDate, date, settings.secretAccessKey);
  signedQuery.push(["X-Amz-Signature", signed.value]);
  return `${settings.endpoint}${path}?${canonicalQuery(signedQuery)}`;
}

function decodeXml(value: string) {
  return value.replace(/&(quot|apos|lt|gt|amp|#x[0-9a-f]+|#\d+);/gi, (entity, code: string) => {
    const named: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };
    const normalized = code.toLowerCase();
    if (normalized in named) return named[normalized];
    const numeric = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });
}

function xmlValue(xml: string, name: string) {
  const raw = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim();
  if (!raw) return null;
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? cdata[1] : decodeXml(raw);
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function createMediaMultipartUpload(key: string, contentType: string) {
  const response = await signedRequest("POST", key, [["uploads", ""]], "", { "content-type": contentType });
  const uploadId = xmlValue(await response.text(), "UploadId");
  if (!uploadId) throw new Error("A cloud não devolveu um identificador para o upload.");
  return uploadId;
}

export async function listMediaMultipartParts(key: string, uploadId: string) {
  const payload = await (await signedRequest("GET", key, [["uploadId", uploadId]])).text();
  return [...payload.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((match) => ({
    partNumber: Number(xmlValue(match[1], "PartNumber")),
    etag: xmlValue(match[1], "ETag") || "",
    size: Number(xmlValue(match[1], "Size") || 0),
  })).filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag);
}

export function presignMediaMultipartParts(key: string, uploadId: string, partNumbers: number[]) {
  return partNumbers.map((partNumber) => ({
    partNumber,
    url: presignedUrl("PUT", key, [["partNumber", String(partNumber)], ["uploadId", uploadId]], 6 * 60 * 60),
  }));
}

export async function completeMediaMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
  const body = `<CompleteMultipartUpload>${parts.sort((a, b) => a.partNumber - b.partNumber).map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  const payload = await (await signedRequest("POST", key, [["uploadId", uploadId]], body, { "content-type": "application/xml" })).text();
  return xmlValue(payload, "ETag");
}

export async function abortMediaMultipartUpload(key: string, uploadId: string) {
  await signedRequest("DELETE", key, [["uploadId", uploadId]]);
}

export function createMediaPlaybackUrl(storageKey: string) {
  const lifetime = 12 * 60 * 60;
  return {
    url: presignedUrl("GET", storageKey, [], lifetime),
    expiresAt: new Date(Date.now() + lifetime * 1000).toISOString(),
  };
}

export async function headMediaObject(key: string) {
  const response = await signedRequest("HEAD", key);
  return {
    contentLength: Number(response.headers.get("content-length") || 0),
    contentType: response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || null,
    etag: response.headers.get("etag"),
  };
}

export interface MediaCorsProbe {
  origin: string;
  playback: {
    status: number;
    allowOrigin: string | null;
    contentType: string | null;
    contentRange: string | null;
    acceptRanges: string | null;
    ok: boolean;
  };
  upload: {
    status: number;
    allowOrigin: string | null;
    allowMethods: string | null;
    allowHeaders: string | null;
    ok: boolean;
  };
}

function corsAllowsOrigin(header: string | null, origin: string) {
  return header === "*" || header === origin;
}

async function publicMediaRequest(url: string, method: "GET" | "OPTIONS", headers: Headers) {
  return process.platform === "win32"
    ? windowsSystemFetch(url, method, headers)
    : fetch(url, { method, headers, cache: "no-store", redirect: "manual" });
}

/** Probe browser-facing R2 CORS without returning either signed URL to the caller. */
export async function probeMediaCors(storageKey: string, origin: string): Promise<MediaCorsProbe> {
  const playbackUrl = createMediaPlaybackUrl(storageKey).url;
  const uploadUrl = presignMediaMultipartParts(storageKey, "cors-diagnostic", [1])[0].url;
  const playbackHeaders = new Headers({ Origin: origin, Range: "bytes=0-0" });
  const uploadHeaders = new Headers({
    Origin: origin,
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": "content-type",
  });
  const [playbackResponse, uploadResponse] = await Promise.all([
    publicMediaRequest(playbackUrl, "GET", playbackHeaders),
    publicMediaRequest(uploadUrl, "OPTIONS", uploadHeaders),
  ]);
  const playbackAllowOrigin = playbackResponse.headers.get("access-control-allow-origin");
  const uploadAllowOrigin = uploadResponse.headers.get("access-control-allow-origin");
  const uploadMethods = uploadResponse.headers.get("access-control-allow-methods");
  const uploadHeadersAllowed = uploadResponse.headers.get("access-control-allow-headers");
  await playbackResponse.body?.cancel();
  await uploadResponse.body?.cancel();
  return {
    origin,
    playback: {
      status: playbackResponse.status,
      allowOrigin: playbackAllowOrigin,
      contentType: playbackResponse.headers.get("content-type"),
      contentRange: playbackResponse.headers.get("content-range"),
      acceptRanges: playbackResponse.headers.get("accept-ranges"),
      ok: playbackResponse.status === 206 && corsAllowsOrigin(playbackAllowOrigin, origin),
    },
    upload: {
      status: uploadResponse.status,
      allowOrigin: uploadAllowOrigin,
      allowMethods: uploadMethods,
      allowHeaders: uploadHeadersAllowed,
      ok: uploadResponse.ok
        && corsAllowsOrigin(uploadAllowOrigin, origin)
        && Boolean(uploadMethods?.split(/\s*,\s*/).includes("PUT")),
    },
  };
}
