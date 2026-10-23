export interface CloudVideoAsset {
  id: string;
  fileName: string;
  fileSize: string;
  durationSeconds: number;
  mimeType: string;
  uploadedAt?: string | null;
}

export interface CloudUploadStatus {
  phase: "preparing" | "uploading" | "finishing";
  progress: number;
  detail: string;
}

type UploadedPart = { partNumber: number; etag?: string; size?: number };

const UPLOAD_BATCH_SIZE = 12;
const UPLOAD_CONCURRENCY = 2;
const UPLOAD_RETRY_DELAYS = [0, 1_000, 2_500, 5_000, 8_000];

async function apiJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível comunicar com a biblioteca cloud.");
  return result;
}

export async function readVideoDuration(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("O vídeo demorou demasiado tempo a abrir.")), 30_000);
      video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error("Não foi possível ler o vídeo selecionado.")); };
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("O vídeo selecionado não tem uma duração válida.");
    return video.duration;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function uploadCloudVideo(file: File, onStatus?: (status: CloudUploadStatus) => void, signal?: AbortSignal) {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) {
    throw new Error("Selecione um ficheiro de vídeo válido.");
  }
  onStatus?.({ phase: "preparing", progress: 0, detail: "A preparar o vídeo…" });
  const durationSeconds = await readVideoDuration(file);
  const init = await apiJson<{
    asset: CloudVideoAsset;
    uploadId: string | null;
    partSize: number;
    completedParts: UploadedPart[];
    alreadyReady: boolean;
  }>("/api/media-library/uploads", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      durationSeconds,
      mimeType: file.type || "video/mp4",
      lastModified: new Date(file.lastModified).toISOString(),
    }),
    signal,
  });
  if (init.alreadyReady) {
    onStatus?.({ phase: "finishing", progress: 1, detail: "Este vídeo já existia na biblioteca." });
    return init.asset;
  }
  if (!init.uploadId) throw new Error("A cloud não iniciou o envio do vídeo.");

  const totalParts = Math.ceil(file.size / init.partSize);
  const completed = new Map(init.completedParts.map((part) => [part.partNumber, part]));
  const partProgress = new Map<number, number>();
  for (const part of init.completedParts) {
    partProgress.set(part.partNumber, part.size || partLength(file.size, init.partSize, part.partNumber));
  }
  const missing = Array.from({ length: totalParts }, (_, index) => index + 1).filter((partNumber) => !completed.has(partNumber));
  const emitProgress = (detail: string) => {
    const uploaded = [...partProgress.values()].reduce((sum, value) => sum + value, 0);
    onStatus?.({ phase: "uploading", progress: Math.min(1, uploaded / file.size), detail });
  };
  emitProgress(init.completedParts.length ? `A retomar depois de ${init.completedParts.length} partes concluídas…` : `A enviar ${totalParts} partes…`);

  try {
    for (let index = 0; index < missing.length; index += UPLOAD_BATCH_SIZE) {
      const batch = missing.slice(index, index + UPLOAD_BATCH_SIZE);
      const signed = await apiJson<{ parts: Array<{ partNumber: number; url: string }> }>("/api/media-library/uploads/parts", {
        method: "POST",
        body: JSON.stringify({ assetId: init.asset.id, uploadId: init.uploadId, partNumbers: batch }),
        signal,
      });
      let cursor = 0;
      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, signed.parts.length) }, async () => {
        while (cursor < signed.parts.length) {
          const current = signed.parts[cursor++];
          const start = (current.partNumber - 1) * init.partSize;
          const blob = file.slice(start, Math.min(file.size, start + init.partSize));
          await uploadPartWithRetry(current.url, blob, (loaded) => {
            partProgress.set(current.partNumber, loaded);
            emitProgress(`A enviar parte ${current.partNumber} de ${totalParts}…`);
          }, signal);
          const part = { partNumber: current.partNumber, size: blob.size };
          completed.set(current.partNumber, part);
          partProgress.set(current.partNumber, blob.size);
          emitProgress(`${completed.size} de ${totalParts} partes concluídas.`);
        }
      });
      await Promise.all(workers);
    }
    onStatus?.({ phase: "finishing", progress: 1, detail: "A finalizar o vídeo na cloud…" });
    const result = await apiJson<{ asset: CloudVideoAsset }>("/api/media-library/uploads/complete", {
      method: "POST",
      body: JSON.stringify({
        assetId: init.asset.id,
        uploadId: init.uploadId,
        partSize: init.partSize,
      }),
      signal,
    });
    return result.asset;
  } catch (error) {
    if (signal?.aborted) {
      await apiJson("/api/media-library/uploads", {
        method: "DELETE",
        body: JSON.stringify({ assetId: init.asset.id, uploadId: init.uploadId }),
      }).catch(() => undefined);
      throw new DOMException("O envio do vídeo foi cancelado.", "AbortError");
    }
    const message = error instanceof Error ? error.message : "O envio foi interrompido.";
    const detail = message === "Failed to fetch"
      ? "Não foi possível chegar à cloud. Confirme a ligação e a configuração CORS do R2."
      : message;
    throw new Error(`${detail} Selecione novamente o mesmo ficheiro para retomar.`);
  }
}

function partLength(fileSize: number, partSize: number, partNumber: number) {
  return Math.max(0, Math.min(partSize, fileSize - (partNumber - 1) * partSize));
}

async function uploadPartWithRetry(url: string, blob: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 0; attempt < UPLOAD_RETRY_DELAYS.length; attempt += 1) {
    if (UPLOAD_RETRY_DELAYS[attempt]) await new Promise((resolve) => window.setTimeout(resolve, UPLOAD_RETRY_DELAYS[attempt]));
    try {
      return await uploadPart(url, blob, onProgress, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível enviar uma das partes do vídeo.");
}

function uploadPart(url: string, blob: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    request.open("PUT", url);
    request.timeout = 10 * 60 * 1_000;
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      cleanup();
      if (request.status < 200 || request.status >= 300) return reject(new Error(`A cloud rejeitou uma parte do vídeo (HTTP ${request.status}).`));
      onProgress(blob.size);
      resolve();
    };
    request.onerror = () => { cleanup(); reject(new Error("O browser não conseguiu enviar o vídeo para a cloud.")); };
    request.ontimeout = () => { cleanup(); reject(new Error("Uma parte do vídeo demorou demasiado tempo a enviar.")); };
    request.onabort = () => { cleanup(); reject(new DOMException("O envio do vídeo foi cancelado.", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    request.send(blob);
  });
}
