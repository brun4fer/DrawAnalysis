import { MetaSamError, requestMetaSamSegmentation, validateSamSegmentRequest } from "@/lib/metaSamServer";
import { requireWorkspace } from "@/lib/auth";
import type { SamErrorResponse } from "@/types/sam";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function errorResponse(error: MetaSamError) {
  const body: SamErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      requestId: error.requestId,
    },
  };
  return json(body, { status: error.status });
}

export async function POST(request: Request) {
  try {
    await requireWorkspace();
  } catch {
    return errorResponse(new MetaSamError("A sessão expirou. Entre novamente antes de usar o SAM 3.1.", "UNAUTHENTICATED", 401, false));
  }

  const apiKey = process.env.META_MODEL_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse(new MetaSamError("META_MODEL_API_KEY não está configurada no servidor.", "SAM_NOT_CONFIGURED", 503, false));
  }

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4_300_000) {
      throw new MetaSamError("O fotograma excede o limite seguro da Vercel.", "IMAGE_TOO_LARGE", 413, false);
    }
    let value: unknown;
    try {
      value = await request.json();
    } catch {
      throw new MetaSamError("O pedido SAM 3.1 não contém JSON válido.", "INVALID_REQUEST", 400, false);
    }
    const input = validateSamSegmentRequest(value);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]);
    return json(await requestMetaSamSegmentation(input, apiKey, signal));
  } catch (error) {
    if (error instanceof MetaSamError) return errorResponse(error);
    return errorResponse(new MetaSamError("Não foi possível concluir a identificação SAM 3.1.", "SAM_INTERNAL_ERROR", 500, true));
  }
}
