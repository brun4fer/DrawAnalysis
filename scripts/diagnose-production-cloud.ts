import "dotenv/config";

const baseUrl = new URL(process.argv[2] || "https://draw-analysis.vercel.app").origin;

async function json(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

async function main() {
  const health = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  console.log({ step: "health", target: `${baseUrl}/api/health`, status: health.status, body: await json(health) });

  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("As credenciais locais de diagnóstico não estão configuradas.");
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginBody = await json(login);
  console.log({ step: "login", target: `${baseUrl}/api/auth/login`, status: login.status, ok: login.ok, error: loginBody.error ?? null });
  if (!login.ok) return;
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("A produção não devolveu o cookie de sessão.");

  const library = await fetch(`${baseUrl}/api/media-library`, { headers: { Cookie: cookie }, cache: "no-store" });
  const libraryBody = await json(library) as { assets?: Array<{ id: string; fileName: string; fileSize: string; durationSeconds: number; mimeType: string }>; error?: string };
  console.log({ step: "library", target: `${baseUrl}/api/media-library`, status: library.status, assets: libraryBody.assets?.length ?? 0, error: libraryBody.error ?? null });
  const diagnostics = await fetch(`${baseUrl}/api/media-library/diagnostics`, { headers: { Cookie: cookie }, cache: "no-store" });
  const diagnosticsBody = await json(diagnostics) as { diagnosticId?: string; environment?: unknown; configuration?: unknown; cors?: unknown; error?: string };
  console.log({ step: "diagnostics", status: diagnostics.status, ...diagnosticsBody });
  const asset = [...(libraryBody.assets ?? [])].sort((left, right) => Number(left.fileSize) - Number(right.fileSize))[0];
  if (!asset) return;

  const playback = await fetch(`${baseUrl}/api/media-library/${encodeURIComponent(asset.id)}/playback`, { headers: { Cookie: cookie }, cache: "no-store" });
  const playbackBody = await json(playback) as { url?: string; error?: string };
  console.log({ step: "playback-api", method: "GET", status: playback.status, hasSignedUrl: Boolean(playbackBody.url), error: playbackBody.error ?? null });
  if (!playbackBody.url) return;

  const media = await fetch(playbackBody.url, { headers: { Origin: baseUrl, Range: "bytes=0-0" }, cache: "no-store" });
  console.log({
    step: "playback-storage",
    method: "GET",
    targetOrigin: new URL(playbackBody.url).origin,
    appOrigin: baseUrl,
    status: media.status,
    allowOrigin: media.headers.get("access-control-allow-origin"),
    contentType: media.headers.get("content-type"),
    contentRange: media.headers.get("content-range"),
    asset: { fileSize: asset.fileSize, durationSeconds: asset.durationSeconds, mimeType: asset.mimeType },
  });
  await media.body?.cancel();
}

main();
