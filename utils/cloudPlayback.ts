export interface CloudPlaybackSelection {
  id: string;
  fileName: string;
  durationSeconds: number;
  url: string;
}

function safeTarget(rawUrl: string) {
  try {
    const url = new URL(rawUrl, window.location.href);
    return url.origin === window.location.origin ? `${url.origin}${url.pathname}` : url.origin;
  } catch {
    return "destino inválido";
  }
}

/** Resolve a fresh signed URL and verify that this browser origin can read one byte. */
export async function resolveCloudPlayback(assetId: string): Promise<CloudPlaybackSelection> {
  const apiPath = `/api/media-library/${encodeURIComponent(assetId)}/playback`;
  let response: Response;
  try {
    response = await fetch(apiPath, { cache: "no-store" });
  } catch {
    throw new Error(`Falha de rede em GET ${safeTarget(apiPath)}.`);
  }
  const result = await response.json().catch(() => ({})) as {
    asset?: { id: string; fileName: string; durationSeconds: number };
    url?: string;
    error?: string;
  };
  if (!response.ok || !result.url || !result.asset) {
    throw new Error(`${result.error || "Não foi possível obter o vídeo cloud."} [GET ${safeTarget(apiPath)} → HTTP ${response.status}]`);
  }

  const storageOrigin = safeTarget(result.url);
  try {
    const mediaResponse = await fetch(result.url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    if (mediaResponse.status !== 206 && !mediaResponse.ok) {
      throw new Error(`HTTP ${mediaResponse.status}`);
    }
    await mediaResponse.body?.cancel();
  } catch (error) {
    const detail = error instanceof Error && error.message !== "Failed to fetch" ? ` (${error.message})` : "";
    throw new Error(`O armazenamento respondeu, mas o browser bloqueou a reprodução. [GET ${storageOrigin} · origem ${window.location.origin} · provável CORS${detail}]`);
  }
  return { ...result.asset, url: result.url };
}
