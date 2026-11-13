import {
  buildObjectPrompt,
  decodeMaskToRaster,
  frameIndexOf,
  parseVideoStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import {
  META_RESPONSES_URL,
  MetaSamError,
  parseMetaSamEventStream,
  providerError,
} from "@/lib/metaSamServer";
import type { SamTrackPrompt, SamTrackResult } from "@/types/samTracking";

const META_FILES_URL = "https://api.meta.ai/v1/files";
export const MAX_SAM_TRACK_VIDEO_BYTES = 4_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateTrackPrompt(value: unknown, width: number, height: number): SamTrackPrompt {
  if (!isRecord(value) || !isRecord(value.point) || !isRecord(value.bounds)) {
    throw new MetaSamError("O pedido de tracking SAM 3.1 é inválido.", "INVALID_TRACK_REQUEST", 400, false);
  }
  const point = { x: Number(value.point.x), y: Number(value.point.y) };
  const bounds = {
    left: Number(value.bounds.left), top: Number(value.bounds.top),
    right: Number(value.bounds.right), bottom: Number(value.bounds.bottom),
  };
  if (![point.x, point.y, bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isInteger)
    || point.x < 0 || point.y < 0 || point.x >= width || point.y >= height
    || bounds.left < 0 || bounds.top < 0 || bounds.right > width || bounds.bottom > height
    || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new MetaSamError("O ponto ou os limites do jogador não correspondem ao vídeo.", "INVALID_TRACK_PROMPT", 400, false);
  }
  return { point, bounds };
}

async function uploadTrackingClip(video: File, apiKey: string, signal: AbortSignal) {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("expires_after", JSON.stringify({ anchor: "created_at", seconds: 3600 }));
  form.set("file", video, video.name || "sam-player-track.mp4");
  const response = await fetch(META_FILES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
    cache: "no-store",
  });
  const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-fb-request-id") ?? undefined;
  if (!response.ok) throw await providerError(response, requestId);
  const value: unknown = await response.json().catch(() => null);
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
    throw new MetaSamError("A Meta não devolveu o identificador do excerto enviado.", "INVALID_FILE_RESPONSE", 502, true, requestId);
  }
  return { fileId: value.id, requestId };
}

async function deleteUploadedFile(fileId: string, apiKey: string) {
  try {
    await fetch(`${META_FILES_URL}/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    // The file also expires after one hour; cleanup must not hide a valid result.
  }
}

export async function requestMetaSamTracking(input: {
  video: File;
  frame: { width: number; height: number };
  frameRate: number;
  duration: 2 | 3;
  prompt: SamTrackPrompt;
}, apiKey: string, signal: AbortSignal): Promise<SamTrackResult> {
  const uploaded = await uploadTrackingClip(input.video, apiKey, signal);
  try {
    const prompt = buildObjectPrompt({
      size: input.frame,
      objects: [{ id: 1, prompts: [{ frame: 0, box: input.prompt.bounds, points: [{ ...input.prompt.point, label: "positive" }] }] }],
    });
    let response: Response;
    try {
      response = await fetch(META_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: "sam-3.1",
          input: [{
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: prompt }, { type: "input_video", file_id: uploaded.fileId }],
          }],
          stream: true,
          store: false,
          metadata: {
            propagation_direction: "forward",
            mask_encoding: "one_bit",
            include_confidence: "true",
          },
        }),
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (signal.aborted) throw new MetaSamError("O tracking SAM 3.1 foi cancelado ou excedeu o tempo disponível.", "META_REQUEST_ABORTED", 504, true);
      throw new MetaSamError(error instanceof Error ? error.message : "Não foi possível contactar a Meta.", "META_UNREACHABLE", 502, true);
    }
    const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-fb-request-id") ?? uploaded.requestId;
    if (!response.ok) throw await providerError(response, requestId);
    if (!response.body) throw new MetaSamError("A Meta devolveu uma resposta de tracking vazia.", "EMPTY_PROVIDER_RESPONSE", 502, true, requestId);
    let result;
    try {
      result = await parseVideoStream(parseMetaSamEventStream(response.body) as AsyncIterable<ResponsesEvent>).finalResult;
    } catch (error) {
      throw new MetaSamError(error instanceof Error ? error.message : "Não foi possível interpretar o tracking devolvido.", "INVALID_PROVIDER_RESPONSE", 502, true, requestId);
    }
    if (result.outcome.status !== "completed") {
      throw new MetaSamError("A Meta terminou o tracking antes de concluir o intervalo.", "INCOMPLETE_PROVIDER_RESPONSE", 502, true, requestId);
    }
    const latestByFrame = new Map<number, SegmentationMaskRecord>();
    for (const record of recordsOfKind(result.records, "mask")) {
      const frameIndex = frameIndexOf(record);
      if (record.objectId !== "1" || frameIndex === undefined) continue;
      const previous = latestByFrame.get(frameIndex);
      if (!previous || record.revision > previous.revision || (record.revision === previous.revision && record.order > previous.order)) {
        latestByFrame.set(frameIndex, record);
      }
    }
    const frames = [...latestByFrame.values()]
      .sort((left, right) => (frameIndexOf(left) ?? 0) - (frameIndexOf(right) ?? 0))
      .flatMap((record) => {
        const frameIndex = frameIndexOf(record);
        const { left, top, right, bottom } = record.bounds;
        if (frameIndex === undefined || left < 0 || top < 0 || right > input.frame.width || bottom > input.frame.height
          || right <= left || bottom <= top || record.mask.width !== right - left || record.mask.height !== bottom - top) return [];
        try {
          if (!decodeMaskToRaster(record.mask).some((pixel) => pixel === 1)) return [];
        } catch { return []; }
        return [{
          frameIndex,
          bounds: { left, top, right, bottom },
          mask: { ...record.mask },
          confidence: record.confidence ?? null,
        }];
      });
    if (!frames.length) {
      throw new MetaSamError("O SAM 3.1 não devolveu máscaras válidas para este intervalo.", "EMPTY_TRACK", 422, false, requestId);
    }
    return { frame: input.frame, frameRate: input.frameRate, duration: input.duration, frames, requestId };
  } finally {
    await deleteUploadedFile(uploaded.fileId, apiKey);
  }
}
