import { requireWorkspace } from "@/lib/auth";
import { MetaSamError } from "@/lib/metaSamServer";
import { MAX_SAM_TRACK_VIDEO_BYTES, requestMetaSamTracking, validateTrackPrompt } from "@/lib/metaSamTrackingServer";
import type { SamErrorResponse } from "@/types/sam";

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
    const form = await request.formData();
    const video = form.get("video");
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));
    const frameRate = Number(form.get("frameRate"));
    const duration = Number(form.get("duration"));
    if (!(video instanceof File) || video.size < 1 || video.size > MAX_SAM_TRACK_VIDEO_BYTES || !video.type.startsWith("video/mp4")) {
      throw new MetaSamError("O excerto deve ser um MP4 válido com menos de 4 MB.", "INVALID_TRACK_VIDEO", 400, false);
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16_384 || height > 16_384
      || !Number.isFinite(frameRate) || frameRate < 1 || frameRate > 60 || (duration !== 2 && duration !== 3)) {
      throw new MetaSamError("As propriedades do excerto são inválidas.", "INVALID_TRACK_METADATA", 400, false);
    }
    let promptValue: unknown;
    try { promptValue = JSON.parse(String(form.get("prompt") ?? "")); }
    catch { throw new MetaSamError("O prompt do tracking não contém JSON válido.", "INVALID_TRACK_PROMPT", 400, false); }
    const prompt = validateTrackPrompt(promptValue, width, height);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(58_000)]);
    return json(await requestMetaSamTracking({ video, frame: { width, height }, frameRate, duration, prompt }, apiKey, signal));
  } catch (error) {
    if (error instanceof MetaSamError) return errorResponse(error);
    return errorResponse(new MetaSamError("Não foi possível concluir o tracking SAM 3.1.", "SAM_TRACK_INTERNAL_ERROR", 500, true));
  }
}
