import {
  buildObjectPrompt,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";
import type { SamSegmentRequest, SamSegmentResult } from "@/types/sam";

export const MAX_SAM_IMAGE_DATA_URL_LENGTH = 3_900_000;
export const META_RESPONSES_URL = "https://api.meta.ai/v1/responses";

export class MetaSamError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "MetaSamError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateSamSegmentRequest(value: unknown): SamSegmentRequest {
  if (!isRecord(value) || !isRecord(value.frame)) {
    throw new MetaSamError("Pedido SAM 3.1 inválido.", "INVALID_REQUEST", 400, false);
  }
  const imageDataUrl = value.imageDataUrl;
  const width = value.frame.width;
  const height = value.frame.height;
  const promptMode = value.promptMode === "box" ? "box" : "point";
  if (typeof imageDataUrl !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)) {
    throw new MetaSamError("O fotograma enviado não é uma imagem válida.", "INVALID_IMAGE", 400, false);
  }
  if (imageDataUrl.length > MAX_SAM_IMAGE_DATA_URL_LENGTH) {
    throw new MetaSamError("O fotograma excede o limite seguro da Vercel. Tente um fotograma menos complexo.", "IMAGE_TOO_LARGE", 413, false);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) < 1 || Number(height) < 1 || Number(width) > 16_384 || Number(height) > 16_384 || Number(width) * Number(height) > 80_000_000) {
    throw new MetaSamError("As dimensões do fotograma são inválidas.", "INVALID_FRAME_SIZE", 400, false);
  }
  if (promptMode === "point") {
    if (!isRecord(value.point)) throw new MetaSamError("O pedido não contém um ponto válido.", "INVALID_POINT", 400, false);
    const x = value.point.x;
    const y = value.point.y;
    if (!Number.isInteger(x) || !Number.isInteger(y) || Number(x) < 0 || Number(y) < 0 || Number(x) >= Number(width) || Number(y) >= Number(height)) {
      throw new MetaSamError("O clique está fora do fotograma.", "INVALID_POINT", 400, false);
    }
    return {
      imageDataUrl,
      frame: { width: Number(width), height: Number(height) },
      promptMode,
      point: { x: Number(x), y: Number(y) },
    };
  }
  if (!isRecord(value.box)) throw new MetaSamError("O pedido não contém uma caixa válida.", "INVALID_BOX", 400, false);
  const left = value.box.left;
  const top = value.box.top;
  const right = value.box.right;
  const bottom = value.box.bottom;
  if (![left, top, right, bottom].every(Number.isInteger)
    || Number(left) < 0 || Number(top) < 0 || Number(right) > Number(width) || Number(bottom) > Number(height)
    || Number(right) <= Number(left) || Number(bottom) <= Number(top)) {
    throw new MetaSamError("A caixa está fora do fotograma ou é demasiado pequena.", "INVALID_BOX", 400, false);
  }
  return {
    imageDataUrl,
    frame: { width: Number(width), height: Number(height) },
    promptMode,
    box: { left: Number(left), top: Number(top), right: Number(right), bottom: Number(bottom) },
  };
}

export function buildSamSegmentationPrompt(input: SamSegmentRequest) {
  return buildObjectPrompt({
    size: input.frame,
    objects: [{
      id: 1,
      prompts: input.promptMode === "box" && input.box
        ? [{ box: input.box }]
        : [{ points: [{ x: input.point!.x, y: input.point!.y, label: "positive" }] }],
    }],
  });
}

function eventFromBlock(block: string): { type: string } | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new MetaSamError("A Meta devolveu um evento ilegível.", "INVALID_PROVIDER_STREAM", 502, true);
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  return parsed as { type: string };
}

/** Convert the provider's native SSE body into the structural events expected by the official parser. */
export async function* parseMetaSamEventStream(body: ReadableStream<Uint8Array>): AsyncIterable<{ type: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = eventFromBlock(block);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    const finalEvent = eventFromBlock(buffer.trim());
    if (finalEvent) yield finalEvent;
  } finally {
    reader.releaseLock();
  }
}

export async function providerError(response: Response, requestId?: string): Promise<MetaSamError> {
  let providerMessage = "";
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string") providerMessage = value.error.message;
  } catch {
    // The status is enough when the provider did not return JSON.
  }
  if (response.status === 401 || response.status === 403) {
    return new MetaSamError("A Meta recusou a API Key configurada.", "META_AUTHENTICATION_FAILED", 502, false, requestId);
  }
  if (response.status === 429) {
    return new MetaSamError("O limite temporário de pedidos da Meta foi atingido. Aguarde e tente novamente.", "META_RATE_LIMITED", 429, true, requestId);
  }
  const suffix = providerMessage ? ` (${providerMessage.slice(0, 180)})` : "";
  return new MetaSamError(`A Meta não conseguiu processar este fotograma${suffix}.`, "META_REQUEST_FAILED", 502, response.status >= 500, requestId);
}

export async function requestMetaSamSegmentation(
  input: SamSegmentRequest,
  apiKey: string,
  signal: AbortSignal,
): Promise<SamSegmentResult> {
  const prompt = buildSamSegmentationPrompt(input);
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
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: input.imageDataUrl },
          ],
        }],
        stream: true,
        store: false,
        metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      }),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new MetaSamError("A identificação SAM 3.1 demorou demasiado ou foi cancelada.", "META_REQUEST_ABORTED", 504, true);
    throw new MetaSamError(error instanceof Error ? error.message : "Não foi possível contactar a Meta.", "META_UNREACHABLE", 502, true);
  }

  const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-fb-request-id") ?? undefined;
  if (!response.ok) throw await providerError(response, requestId);
  if (!response.body) throw new MetaSamError("A Meta devolveu uma resposta vazia.", "EMPTY_PROVIDER_RESPONSE", 502, true, requestId);

  let result;
  try {
    result = await parseImageStream(parseMetaSamEventStream(response.body) as AsyncIterable<ResponsesEvent>).finalResult;
  } catch (error) {
    throw new MetaSamError(error instanceof Error ? error.message : "Não foi possível interpretar a máscara devolvida.", "INVALID_PROVIDER_RESPONSE", 502, true, requestId);
  }
  if (result.outcome.status !== "completed") {
    throw new MetaSamError("A Meta terminou a identificação antes de devolver a máscara.", "INCOMPLETE_PROVIDER_RESPONSE", 502, true, requestId);
  }
  const maskRecord = recordsOfKind(result.records, "mask").find((record) => record.objectId === "1")
    ?? recordsOfKind(result.records, "mask")[0];
  if (!maskRecord) {
    throw new MetaSamError("O SAM 3.1 não encontrou um jogador nesse ponto. Clique no centro do corpo e tente novamente.", "EMPTY_MASK", 422, false, requestId);
  }
  let raster: Uint8Array;
  try {
    raster = decodeMaskToRaster(maskRecord.mask);
  } catch {
    throw new MetaSamError("A máscara devolvida pelo SAM 3.1 é inválida.", "INVALID_MASK", 502, true, requestId);
  }
  if (!raster.some((value) => value === 1)) {
    throw new MetaSamError("O SAM 3.1 devolveu uma máscara vazia. Clique no centro do corpo e tente novamente.", "EMPTY_MASK", 422, false, requestId);
  }
  const { left, top, right, bottom } = maskRecord.bounds;
  if (left < 0 || top < 0 || right > input.frame.width || bottom > input.frame.height || right <= left || bottom <= top) {
    throw new MetaSamError("A máscara devolvida não corresponde às dimensões do fotograma.", "MISALIGNED_MASK", 502, true, requestId);
  }
  return {
    frame: input.frame,
    bounds: { left, top, right, bottom },
    mask: { ...maskRecord.mask },
    confidence: maskRecord.confidence ?? null,
    requestId,
  };
}
