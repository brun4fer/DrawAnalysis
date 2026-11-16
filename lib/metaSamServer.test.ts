import assert from "node:assert/strict";
import test from "node:test";
import { buildSamSegmentationPrompt, MetaSamError, parseMetaSamEventStream, validateSamSegmentRequest } from "./metaSamServer";

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

test("validates a half-open box prompt in original-frame coordinates", () => {
  const value = validateSamSegmentRequest({
    imageDataUrl: `data:image/jpeg;base64,${Buffer.from("frame").toString("base64")}`,
    frame: { width: 1920, height: 1080 },
    promptMode: "box",
    box: { left: 100, top: 80, right: 200, bottom: 400 },
  });
  assert.equal(value.promptMode, "box");
  assert.deepEqual(value.box, { left: 100, top: 80, right: 200, bottom: 400 });
  assert.equal(buildSamSegmentationPrompt(value), "<0f>1<|box;x1=100;y1=80;x2=199;y2=399;w=1920;h=1080|>");
});

test("rejects an empty or out-of-frame box", () => {
  const base = {
    imageDataUrl: `data:image/jpeg;base64,${Buffer.from("frame").toString("base64")}`,
    frame: { width: 100, height: 100 },
    promptMode: "box",
  };
  assert.throws(
    () => validateSamSegmentRequest({ ...base, box: { left: 20, top: 10, right: 20, bottom: 80 } }),
    (error) => error instanceof MetaSamError && error.code === "INVALID_BOX",
  );
  assert.throws(
    () => validateSamSegmentRequest({ ...base, box: { left: 20, top: 10, right: 101, bottom: 80 } }),
    (error) => error instanceof MetaSamError && error.code === "INVALID_BOX",
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
