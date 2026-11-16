import assert from "node:assert/strict";
import test from "node:test";
import { parseSamTrackingStreamEvent } from "./samTrackingClient";

test("parses real tracking progress without inventing a percentage", () => {
  const event = parseSamTrackingStreamEvent(JSON.stringify({
    type: "progress",
    progress: { stage: "meta-processing", elapsedMs: 1234, framesReceived: 18, expectedFrames: 75 },
  }));
  assert.equal(event?.type, "progress");
  if (event?.type === "progress") {
    assert.equal(event.progress.framesReceived, 18);
    assert.equal(event.progress.expectedFrames, 75);
    assert.equal("percent" in event.progress, false);
  }
});

test("rejects malformed tracking stream lines", () => {
  assert.equal(parseSamTrackingStreamEvent("not-json"), null);
  assert.equal(parseSamTrackingStreamEvent('{"type":"result"}'), null);
});
