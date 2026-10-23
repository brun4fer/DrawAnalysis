import "dotenv/config";

const defaults = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://draw-analysis.vercel.app",
  "https://ap-gameplan.vercel.app",
  "https://ap-written-report.vercel.app",
];
const configured = process.env.MEDIA_ALLOWED_ORIGINS?.split(",") ?? [];
const commandLine = process.argv.slice(2);
const origins = commandLine.length ? commandLine : configured.length ? configured : defaults;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} apenas no ambiente local de manutenção.`);
  return value;
}

function validatedOrigins(values: string[]) {
  return [...new Set(values.map((value) => value.trim().replace(/\/+$/, "")))].filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.hostname === "localhost";
    } catch {
      return false;
    }
  });
}

async function cloudflareCors(method: "GET" | "PUT", rules?: unknown) {
  const endpoint = required("MEDIA_R2_ENDPOINT");
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || new URL(endpoint).hostname.split(".")[0];
  const bucket = required("MEDIA_R2_BUCKET_NAME");
  const token = required("CLOUDFLARE_API_TOKEN");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/cors`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(rules ? { "Content-Type": "application/json" } : {}),
    },
    body: rules ? JSON.stringify({ rules }) : undefined,
  });
  const result = await response.json().catch(() => ({})) as { success?: boolean; errors?: Array<{ message?: string }>; result?: unknown };
  if (!response.ok || !result.success) {
    throw new Error(`Cloudflare API ${response.status}: ${result.errors?.map((error) => error.message).filter(Boolean).join("; ") || "pedido rejeitado"}`);
  }
  return result.result;
}

async function main() {
  const allowedOrigins = validatedOrigins(origins);
  if (!allowedOrigins.length) throw new Error("Não foi indicada nenhuma origem válida.");
  console.log("Política anterior:");
  console.dir(await cloudflareCors("GET"), { depth: 8 });
  const rules = [{
    id: "draw-analysis-apps",
    allowed: { origins: allowedOrigins, methods: ["GET", "HEAD", "PUT"], headers: ["*"] },
    exposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    maxAgeSeconds: 3600,
  }];
  await cloudflareCors("PUT", rules);
  console.log("Origens configuradas:", allowedOrigins);
  console.log("Política atual:");
  console.dir(await cloudflareCors("GET"), { depth: 8 });
}

main();
