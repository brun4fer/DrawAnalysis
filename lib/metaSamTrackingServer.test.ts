import assert from "node:assert/strict";
import test from "node:test";
import { MetaSamError } from "./metaSamServer";
import { validateTrackPrompt } from "./metaSamTrackingServer";

test("accepts half-open player bounds and a point inside the source video", () => {
  assert.deepEqual(validateTrackPrompt({
    point: { x: 125, y: 170 },
    bounds: { left: 100, top: 80, right: 151, bottom: 241 },
  }, 1920, 1080), {
    point: { x: 125, y: 170 },
    bounds: { left: 100, top: 80, right: 151, bottom: 241 },
  });
});

test("rejects prompts outside the video without calling the provider", () => {
  assert.throws(() => validateTrackPrompt({
    point: { x: 1920, y: 170 },
    bounds: { left: 100, top: 80, right: 151, bottom: 241 },
  }, 1920, 1080), (error) => error instanceof MetaSamError && error.code === "INVALID_TRACK_PROMPT");
});
