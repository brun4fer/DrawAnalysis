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
import type { SamTrackPrompt, SamTrackResult, SamTrackingProgress } from "@/types/samTracking";

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

export async function requestMetaSamTracking(input: {
  video: File;
  frame: { width: number; height: number };
  frameRate: number;
  frameCount: number;
  duration: 2 | 3;
  prompt: SamTrackPrompt;
}, apiKey: string, signal: AbortSignal, onProgress?: (progress: SamTrackingProgress) => void): Promise<SamTrackResult> {
  const serverStartedAt = performance.now();
  onProgress?.({ stage: "meta-upload", elapsedMs: 0, expectedFrames: input.frameCount });
  const uploadStartedAt = performance.now();
  const uploaded = await uploadTrackingClip(input.video, apiKey, signal);
  const metaUploadMs = performance.now() - uploadStartedAt;

  const prompt = buildObjectPrompt({
    size: input.frame,
    objects: [{ id: 1, prompts: [{ frame: 0, box: input.prompt.bounds, points: [{ ...input.prompt.point, label: "positive" }] }] }],
  });
  onProgress?.({ stage: "meta-processing", elapsedMs: performance.now() - serverStartedAt, framesReceived: 0, expectedFrames: input.frameCount });
  const metaStartedAt = performance.now();
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
  const receivedFrames = new Set<number>();
  let firstMaskMs: number | undefined;
  let processedRecords = 0;
  let lastReportedFrames = 0;
  try {
    const parsed = parseVideoStream(parseMetaSamEventStream(response.body) as AsyncIterable<ResponsesEvent>);
    for await (const snapshot of parsed) {
      for (const record of snapshot.records.slice(processedRecords)) {
        if (record.kind !== "mask" || record.objectId !== "1") continue;
        const frameIndex = frameIndexOf(record);
        if (frameIndex !== undefined) receivedFrames.add(frameIndex);
      }
      processedRecords = snapshot.records.length;
      if (receivedFrames.size && firstMaskMs === undefined) firstMaskMs = performance.now() - metaStartedAt;
      if (receivedFrames.size !== lastReportedFrames) {
        lastReportedFrames = receivedFrames.size;
        onProgress?.({
          stage: "meta-processing",
          elapsedMs: performance.now() - serverStartedAt,
          framesReceived: receivedFrames.size,
          expectedFrames: input.frameCount,
        });
      }
    }
    result = await parsed.finalResult;
  } catch (error) {
    throw new MetaSamError(error instanceof Error ? error.message : "Não foi possível interpretar o tracking devolvido.", "INVALID_PROVIDER_RESPONSE", 502, true, requestId);
  }
  const metaProcessingMs = performance.now() - metaStartedAt;
  onProgress?.({
    stage: "mask-conversion",
    elapsedMs: performance.now() - serverStartedAt,
    framesReceived: receivedFrames.size,
    expectedFrames: input.frameCount,
  });
  const conversionStartedAt = performance.now();

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
  const maskConversionMs = performance.now() - conversionStartedAt;

  // The file expires automatically after one hour. Waiting for a DELETE after a valid
  // result only delayed the editor and did not change the returned tracking quality.
  return {
    frame: input.frame,
    frameRate: input.frameRate,
    duration: input.duration,
    frames,
    requestId,
    timings: {
      requestParseMs: 0,
      metaUploadMs,
      metaProcessingMs,
      firstMaskMs,
      maskConversionMs,
      serverTotalMs: performance.now() - serverStartedAt,
      inputBytes: input.video.size,
      framesReceived: receivedFrames.size,
    },
  };
}
