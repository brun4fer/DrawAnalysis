import type { SamErrorResponse } from "@/types/sam";
import type {
  SamTrackPrompt,
  SamTrackResult,
  SamTrackingExecution,
  SamTrackingProgress,
  SamTrackingStreamEvent,
} from "@/types/samTracking";
import type { RecordedSamClip } from "@/lib/samClipRecorder";
import { SamClientError } from "@/lib/samClient";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSamTrackingStreamEvent(line: string): SamTrackingStreamEvent | null {
  let value: unknown;
  try { value = JSON.parse(line); }
  catch { return null; }
  if (!isRecord(value) || (value.type !== "progress" && value.type !== "result" && value.type !== "error")) return null;
  if (value.type === "progress" && isRecord(value.progress) && typeof value.progress.stage === "string") {
    return value as unknown as SamTrackingStreamEvent;
  }
  if (value.type === "result" && isRecord(value.result) && Array.isArray(value.result.frames)) {
    return value as unknown as SamTrackingStreamEvent;
  }
  if (value.type === "error" && isRecord(value.error) && typeof value.error.message === "string") {
    return value as unknown as SamTrackingStreamEvent;
  }
  return null;
}

async function readTrackingStream(response: Response, onProgress?: (progress: SamTrackingProgress) => void) {
  if (!response.body) throw new SamClientError("A função de tracking devolveu uma resposta vazia.", "EMPTY_TRACK_RESPONSE", true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result: SamTrackResult | undefined;
  let streamError: Extract<SamTrackingStreamEvent, { type: "error" }>["error"] | undefined;
  const acceptLine = (line: string) => {
    const event = parseSamTrackingStreamEvent(line);
    if (!event) return;
    if (event.type === "progress") onProgress?.(event.progress);
    else if (event.type === "result") result = event.result;
    else streamError = event.error;
  };
  for (;;) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line) acceptLine(line);
      newline = pending.indexOf("\n");
    }
    if (done) break;
  }
  if (pending.trim()) acceptLine(pending.trim());
  if (streamError) throw new SamClientError(streamError.message, streamError.code, streamError.retryable);
  if (!result) throw new SamClientError("O tracking terminou sem devolver um resultado.", "EMPTY_TRACK_RESULT", true);
  return result;
}

export async function trackSamPlayer(
  clip: RecordedSamClip,
  prompt: SamTrackPrompt,
  options?: { signal?: AbortSignal; onProgress?: (progress: SamTrackingProgress) => void },
): Promise<SamTrackingExecution> {
  const form = new FormData();
  form.set("video", new File([clip.blob], "sam-player-track.mp4", { type: "video/mp4" }));
  form.set("width", String(clip.width));
  form.set("height", String(clip.height));
  form.set("frameRate", String(clip.frameRate));
  form.set("frameCount", String(clip.sourceFrameTimes.length));
  form.set("duration", String(clip.duration));
  form.set("prompt", JSON.stringify(prompt));
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch("/api/sam/track", { method: "POST", body: form, cache: "no-store", signal: options?.signal });
  } catch (error) {
    if (options?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SamClientError("O tracking SAM 3.1 foi cancelado.", "REQUEST_ABORTED", true);
    }
    throw new SamClientError("Não foi possível comunicar com a função de tracking SAM 3.1.", "NETWORK_ERROR", true);
  }
  const responseStartedAt = performance.now();
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const error = value as SamErrorResponse | null;
    throw new SamClientError(error?.error?.message || "O tracking SAM 3.1 falhou.", error?.error?.code || "SAM_TRACK_FAILED", error?.error?.retryable ?? response.status >= 500, response.status);
  }
  const result = response.headers.get("content-type")?.includes("application/x-ndjson")
    ? await readTrackingStream(response, options?.onProgress)
    : await response.json() as SamTrackResult;
  const completedAt = performance.now();
  return {
    result,
    timings: {
      browserUploadMs: responseStartedAt - startedAt,
      responseStreamMs: completedAt - responseStartedAt,
      apiRoundTripMs: completedAt - startedAt,
    },
  };
}
