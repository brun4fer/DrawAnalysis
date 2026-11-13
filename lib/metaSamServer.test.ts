import assert from "node:assert/strict";
import test from "node:test";
import { MetaSamError, parseMetaSamEventStream, validateSamSegmentRequest } from "./metaSamServer";

function streamFrom(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

test("validates a point prompt without changing source dimensions", () => {
  const value = validateSamSegmentRequest({
    imageDataUrl: `data:image/jpeg;base64,${Buffer.from("frame").toString("base64")}`,
    frame: { width: 1920, height: 1080 },
    point: { x: 811, y: 412 },
  });
  assert.deepEqual(value.frame, { width: 1920, height: 1080 });
  assert.deepEqual(value.point, { x: 811, y: 412 });
});

test("rejects a click outside the original frame", () => {
  assert.throws(
    () => validateSamSegmentRequest({
      imageDataUrl: `data:image/jpeg;base64,${Buffer.from("frame").toString("base64")}`,
      frame: { width: 10, height: 10 },
      point: { x: 10, y: 5 },
    }),
    (error) => error instanceof MetaSamError && error.code === "INVALID_POINT",
  );
});

test("parses Meta SSE events split across network chunks", async () => {
  const body = streamFrom([
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"abc\",\"item_id\":\"m",
    "1\",\"output_index\":0,\"content_index\":0}\r\n\r\n",
    "data: {\"type\":\"response.completed\"}\n\n",
    "data: [DONE]\n\n",
  ]);
  const events: Array<{ type: string }> = [];
  for await (const event of parseMetaSamEventStream(body)) events.push(event);
  assert.deepEqual(events.map((event) => event.type), ["response.output_text.delta", "response.completed"]);
});
