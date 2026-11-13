import type { SamErrorResponse } from "@/types/sam";
import type { SamTrackPrompt, SamTrackResult } from "@/types/samTracking";
import type { RecordedSamClip } from "@/lib/samClipRecorder";
import { SamClientError } from "@/lib/samClient";

export async function trackSamPlayer(clip: RecordedSamClip, prompt: SamTrackPrompt, signal?: AbortSignal) {
  const form = new FormData();
  form.set("video", new File([clip.blob], "sam-player-track.mp4", { type: "video/mp4" }));
  form.set("width", String(clip.width));
  form.set("height", String(clip.height));
  form.set("frameRate", String(clip.frameRate));
  form.set("duration", String(clip.duration));
  form.set("prompt", JSON.stringify(prompt));
  let response: Response;
  try {
    response = await fetch("/api/sam/track", { method: "POST", body: form, cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SamClientError("O tracking SAM 3.1 foi cancelado.", "REQUEST_ABORTED", true);
    }
    throw new SamClientError("Não foi possível comunicar com a função de tracking SAM 3.1.", "NETWORK_ERROR", true);
  }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = value as SamErrorResponse | null;
    throw new SamClientError(error?.error?.message || "O tracking SAM 3.1 falhou.", error?.error?.code || "SAM_TRACK_FAILED", error?.error?.retryable ?? response.status >= 500, response.status);
  }
  return value as SamTrackResult;
}
