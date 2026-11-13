import type { Point } from "@/types/drawing";
import type { SamErrorResponse, SamSegmentRequest, SamSegmentResult } from "@/types/sam";

const MAX_SAM_IMAGE_DATA_URL_LENGTH = 3_900_000;

export class SamClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SamClientError";
  }
}

export function encodeOriginalFrameForSam(frame: HTMLCanvasElement) {
  const qualities = [.98, .94, .9, .84, .76, .68, .58];
  for (const quality of qualities) {
    const imageDataUrl = frame.toDataURL("image/jpeg", quality);
    if (imageDataUrl.startsWith("data:image/jpeg;base64,") && imageDataUrl.length <= MAX_SAM_IMAGE_DATA_URL_LENGTH) {
      return imageDataUrl;
    }
  }
  throw new SamClientError(
    "O fotograma mantém a resolução original, mas continua demasiado grande para o limite de 4,5 MB da Vercel.",
    "IMAGE_TOO_LARGE",
    false,
    413,
  );
}

export async function segmentFrameAtPoint(frame: HTMLCanvasElement, point: Point, signal?: AbortSignal) {
  const request: SamSegmentRequest = {
    imageDataUrl: encodeOriginalFrameForSam(frame),
    frame: { width: frame.width, height: frame.height },
    point: {
      x: Math.max(0, Math.min(frame.width - 1, Math.floor(point.x * frame.width))),
      y: Math.max(0, Math.min(frame.height - 1, Math.floor(point.y * frame.height))),
    },
  };
  let response: Response;
  try {
    response = await fetch("/api/sam/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new SamClientError("A identificação SAM 3.1 foi cancelada.", "REQUEST_ABORTED", true);
    }
    throw new SamClientError("Não foi possível comunicar com a função SAM 3.1.", "NETWORK_ERROR", true);
  }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = value as SamErrorResponse | null;
    throw new SamClientError(
      error?.error?.message || "A identificação SAM 3.1 falhou.",
      error?.error?.code || "SAM_REQUEST_FAILED",
      error?.error?.retryable ?? response.status >= 500,
      response.status,
    );
  }
  return value as SamSegmentResult;
}
