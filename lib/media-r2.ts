import { createHash, createHmac } from "node:crypto";

type QueryEntry = [string, string];
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Falta configurar ${name}.`); return value; };
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
const canonicalQuery = (entries: QueryEntry[]) => entries.map(([key, value]) => [encode(key), encode(value)] as const).sort(([ak, av], [bk, bv]) => ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk)).map(([key, value]) => `${key}=${value}`).join("&");

export function createMediaPlaybackUrl(storageKey: string) {
  const endpoint = required("MEDIA_R2_ENDPOINT").replace(/\/+$/, "");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") throw new Error("MEDIA_R2_ENDPOINT deve usar HTTPS.");
  const bucket = required("MEDIA_R2_BUCKET_NAME");
  const accessKey = required("MEDIA_R2_ACCESS_KEY_ID");
  const secret = required("MEDIA_R2_SECRET_ACCESS_KEY");
  const path = `/${encode(bucket)}/${storageKey.split("/").map(encode).join("/")}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const lifetime = 12 * 60 * 60;
  const query: QueryEntry[] = [["X-Amz-Algorithm", "AWS4-HMAC-SHA256"], ["X-Amz-Credential", `${accessKey}/${scope}`], ["X-Amz-Date", amzDate], ["X-Amz-Expires", String(lifetime)], ["X-Amz-SignedHeaders", "host"]];
  const canonical = ["GET", path, canonicalQuery(query), `host:${parsed.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonical)].join("\n");
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  query.push(["X-Amz-Signature", createHmac("sha256", signingKey).update(stringToSign).digest("hex")]);
  return { url: `${endpoint}${path}?${canonicalQuery(query)}`, expiresAt: new Date(Date.now() + lifetime * 1000).toISOString() };
}
