import { requireWorkspace } from "@/lib/auth";
import { MetaSamError } from "@/lib/metaSamServer";
import { MAX_SAM_TRACK_VIDEO_BYTES, requestMetaSamTracking, validateTrackPrompt } from "@/lib/metaSamTrackingServer";
import type { SamErrorResponse } from "@/types/sam";
import type { SamTrackingStreamEvent } from "@/types/samTracking";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function errorResponse(error: MetaSamError) {
  const body: SamErrorResponse = { error: { code: error.code, message: error.message, retryable: error.retryable, requestId: error.requestId } };
  return json(body, { status: error.status });
}

export async function POST(request: Request) {
  try { await requireWorkspace(); }
  catch { return errorResponse(new MetaSamError("A sessão expirou. Entre novamente antes de usar o SAM 3.1.", "UNAUTHENTICATED", 401, false)); }
  const apiKey = process.env.META_MODEL_API_KEY?.trim();
  if (!apiKey) return errorResponse(new MetaSamError("META_MODEL_API_KEY não está configurada no servidor.", "SAM_NOT_CONFIGURED", 503, false));
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_SAM_TRACK_VIDEO_BYTES + 180_000) {
      throw new MetaSamError("O excerto excede o limite seguro da função Vercel.", "VIDEO_TOO_LARGE", 413, false);
    }
    const parseStartedAt = performance.now();
    const form = await request.formData();
    const requestParseMs = performance.now() - parseStartedAt;
    const video = form.get("video");
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));
    const frameRate = Number(form.get("frameRate"));
    const frameCount = Number(form.get("frameCount"));
    const duration = Number(form.get("duration"));
    if (!(video instanceof File) || video.size < 1 || video.size > MAX_SAM_TRACK_VIDEO_BYTES || !video.type.startsWith("video/mp4")) {
      throw new MetaSamError("O excerto deve ser um MP4 válido com menos de 4 MB.", "INVALID_TRACK_VIDEO", 400, false);
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16_384 || height > 16_384
      || !Number.isFinite(frameRate) || frameRate < 1 || frameRate > 240
      || !Number.isInteger(frameCount) || frameCount < 2 || frameCount > 1_000
      || (duration !== 2 && duration !== 3)) {
      throw new MetaSamError("As propriedades do excerto são inválidas.", "INVALID_TRACK_METADATA", 400, false);
    }
    let promptValue: unknown;
    try { promptValue = JSON.parse(String(form.get("prompt") ?? "")); }
    catch { throw new MetaSamError("O prompt do tracking não contém JSON válido.", "INVALID_TRACK_PROMPT", 400, false); }
    const prompt = validateTrackPrompt(promptValue, width, height);
    const localController = new AbortController();
    const signal = AbortSignal.any([request.signal, localController.signal, AbortSignal.timeout(58_000)]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (event: SamTrackingStreamEvent) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
          catch { closed = true; localController.abort(); }
        };
        send({ type: "progress", progress: { stage: "request-received", elapsedMs: requestParseMs, expectedFrames: frameCount } });
        void requestMetaSamTracking(
          { video, frame: { width, height }, frameRate, frameCount, duration, prompt },
          apiKey,
          signal,
          (progress) => send({ type: "progress", progress }),
        ).then((result) => {
          if (result.timings) {
            result.timings.requestParseMs = requestParseMs;
            result.timings.serverTotalMs += requestParseMs;
          }
          send({ type: "result", result });
        }).catch((error: unknown) => {
          const failure = error instanceof MetaSamError
            ? error
            : new MetaSamError("Não foi possível concluir o tracking SAM 3.1.", "SAM_TRACK_INTERNAL_ERROR", 500, true);
          send({
            type: "error",
            error: { code: failure.code, message: failure.message, retryable: failure.retryable, requestId: failure.requestId },
          });
        }).finally(() => {
          if (closed) return;
          closed = true;
          controller.close();
        });
      },
      cancel() { localController.abort(); },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MetaSamError) return errorResponse(error);
    return errorResponse(new MetaSamError("Não foi possível concluir o tracking SAM 3.1.", "SAM_TRACK_INTERNAL_ERROR", 500, true));
  }
}
