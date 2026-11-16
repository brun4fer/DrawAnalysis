import assert from "node:assert/strict";
import test from "node:test";
import type { SamTrackResult } from "@/types/samTracking";
import { prepareSlidesForStorage } from "./presentationData";
import { buildSamPlayerTracking, resolveSamTrackingFrameAtTime, samTrackingFrameAtTime, trimSamPlayerTracking } from "./samTracking";
import { createSlide } from "./slideFactory";

function result(): SamTrackResult {
  return {
    frame: { width: 1000, height: 500 },
    frameRate: 25,
    duration: 2,
    frames: [0, 1, 3].map((frameIndex) => ({
      frameIndex,
      bounds: { left: 100 + frameIndex * 2, top: 100, right: 200 + frameIndex * 2, bottom: 300 },
      mask: { encoding: "one_bit", payload: `mask-${frameIndex}`, width: 100, height: 200 },
      confidence: .9,
    })),
  };
}

test("maps returned frame indexes to the original editor timeline and preserves missing-frame gaps", () => {
  const tracking = buildSamPlayerTracking(result(), 10, { x: .1, y: .2, width: .1, height: .4 });
  assert.deepEqual(tracking.frames.map((frame) => frame.time), [10, 10.04, 10.12]);
  assert.equal(samTrackingFrameAtTime(tracking, 10.04)?.frameIndex, 1);
  assert.equal(samTrackingFrameAtTime(tracking, 10.08), undefined);
  assert.equal(tracking.endTime, 12);
});

test("uses the exact captured mediaTime map instead of assuming 25 FPS", () => {
  const sourceFrameTimes = [10.002, 10.0354, 10.0688, 10.1022];
  const tracking = buildSamPlayerTracking(
    { ...result(), frameRate: 29.94 },
    10.002,
    { x: .1, y: .2, width: .1, height: .4 },
    undefined,
    sourceFrameTimes,
  );
  assert.deepEqual(tracking.frames.map((frame) => frame.sourceTime), [10.002, 10.0354, 10.1022]);
  assert.equal(samTrackingFrameAtTime(tracking, 10.0354)?.frameIndex, 1);
  const repaired = resolveSamTrackingFrameAtTime(tracking, 10.0688);
  assert.equal(repaired.mode, "interpolated");
  assert.equal(repaired.frame?.frameIndex, 1);
  assert.ok(Math.abs((repaired.bounds?.x ?? 0) - .104) < .000001);
  assert.equal(samTrackingFrameAtTime(tracking, 10.1022)?.frameIndex, 3);
});

test("accepts a presented frame using the interval on the correct side in variable-frame-rate video", () => {
  const sourceFrameTimes = [0, .01, .05, .09];
  const tracking = buildSamPlayerTracking(
    { ...result(), frameRate: 30 },
    0,
    { x: .1, y: .2, width: .1, height: .4 },
    undefined,
    sourceFrameTimes,
  );
  const resolution = resolveSamTrackingFrameAtTime(tracking, .029);
  assert.equal(resolution.mode, "exact");
  assert.equal(resolution.frame?.frameIndex, 1);
});

test("keeps frame correspondence at common 24, 30, 50 and 60 FPS rates", () => {
  for (const fps of [24, 30, 50, 60]) {
    const sourceFrameTimes = Array.from({ length: 4 }, (_value, index) => 7 + index / fps);
    const tracking = buildSamPlayerTracking(
      { ...result(), frameRate: fps },
      7,
      { x: .1, y: .2, width: .1, height: .4 },
      undefined,
      sourceFrameTimes,
    );
    assert.equal(samTrackingFrameAtTime(tracking, sourceFrameTimes[1])?.frameIndex, 1, `${fps} FPS`);
    assert.equal(resolveSamTrackingFrameAtTime(tracking, sourceFrameTimes[2]).mode, "interpolated", `${fps} FPS missing mask`);
    assert.equal(samTrackingFrameAtTime(tracking, sourceFrameTimes[3])?.frameIndex, 3, `${fps} FPS`);
  }
});

test("interpolates at most two isolated missing frames", () => {
  const input = result();
  input.frames = [input.frames[0], input.frames[1], {
    ...input.frames[2],
    frameIndex: 4,
    bounds: { left: 108, top: 100, right: 208, bottom: 300 },
  }];
  const times = [4, 4.04, 4.08, 4.12, 4.16];
  const tracking = buildSamPlayerTracking(input, 4, { x: .1, y: .2, width: .1, height: .4 }, undefined, times);
  assert.equal(resolveSamTrackingFrameAtTime(tracking, times[2]).mode, "interpolated");
  assert.equal(resolveSamTrackingFrameAtTime(tracking, times[3]).mode, "interpolated");
});

test("keeps longer gaps and implausible motion empty", () => {
  const input = result();
  input.frames = [input.frames[0], input.frames[1], {
    ...input.frames[2],
    frameIndex: 5,
    bounds: { left: 110, top: 100, right: 210, bottom: 300 },
  }];
  const times = [6, 6.04, 6.08, 6.12, 6.16, 6.2];
  const longGap = buildSamPlayerTracking(input, 6, { x: .1, y: .2, width: .1, height: .4 }, undefined, times);
  assert.equal(resolveSamTrackingFrameAtTime(longGap, times[2]).mode, "unsafe-gap");

  const unsafeInput = result();
  unsafeInput.frames[2] = {
    ...unsafeInput.frames[2],
    bounds: { left: 500, top: 100, right: 600, bottom: 300 },
  };
  const unsafeMotion = buildSamPlayerTracking(unsafeInput, 6, { x: .1, y: .2, width: .1, height: .4 }, undefined, times.slice(0, 4));
  assert.equal(resolveSamTrackingFrameAtTime(unsafeMotion, times[2]).mode, "unsafe-gap");
});

test("ignores provider indexes that do not exist in the captured-frame map", () => {
  const input = result();
  input.frames.push({
    frameIndex: 8,
    bounds: { left: 106, top: 100, right: 206, bottom: 300 },
    mask: { encoding: "one_bit", payload: "unmapped", width: 100, height: 200 },
    confidence: .9,
  });
  const tracking = buildSamPlayerTracking(input, 5, { x: .1, y: .2, width: .1, height: .4 }, undefined, [5, 5.04, 5.08, 5.12]);
  assert.equal(tracking.frames.some((frame) => frame.frameIndex === 8), false);
});

test("reuses the first two seconds of a synchronized three-second tracking", () => {
  const input = result();
  input.duration = 3;
  input.frames = [input.frames[0], input.frames[1], { ...input.frames[2], frameIndex: 3 }];
  const times = [10, 10.04, 10.08, 10.12, 12.04, 13];
  const tracking = buildSamPlayerTracking(input, 10, { x: .1, y: .2, width: .1, height: .4 }, undefined, times);
  const trimmed = trimSamPlayerTracking(tracking, 2, 12);
  assert.equal(trimmed.duration, 2);
  assert.equal(trimmed.endTime, 12);
  assert.deepEqual(trimmed.frameTimes, times.slice(0, 4));
  assert.deepEqual(trimmed.frames.map((frame) => frame.frameIndex), [0, 1, 3]);
  assert.equal(tracking.duration, 3);
});

test("stops at an implausible jump instead of switching identity", () => {
  const input = result();
  input.frames.push({
    frameIndex: 4,
    bounds: { left: 800, top: 20, right: 900, bottom: 220 },
    mask: { encoding: "one_bit", payload: "wrong-player", width: 100, height: 200 },
    confidence: .95,
  });
  const tracking = buildSamPlayerTracking(input, 0, { x: .1, y: .2, width: .1, height: .4 });
  assert.deepEqual(tracking.frames.map((frame) => frame.frameIndex), [0, 1, 3]);
});

test("persists compact tracking masks and keeps old projects compatible", () => {
  const slide = createSlide("video", 0);
  assert.equal(slide.content.kind, "video");
  if (slide.content.kind !== "video") return;
  const tracking = buildSamPlayerTracking(result(), 5, { x: .1, y: .2, width: .1, height: .4 });
  slide.content.playerTracks = [{
    id: "sam-player", name: "Jogador 1", source: "automatic", status: "ready",
    samples: [{ time: 5, bbox: { x: .1, y: .2, width: .1, height: .4 }, foot: { x: .15, y: .6 }, confidence: .9 }],
    samTracking: tracking,
  }];
  const [stored] = prepareSlidesForStorage([slide]);
  assert.equal(stored.content.kind, "video");
  if (stored.content.kind !== "video") return;
  assert.equal(stored.content.playerTracks?.[0]?.samTracking?.frames[2]?.mask.payload, "mask-3");

  const oldSlide = createSlide("video", 1);
  assert.doesNotThrow(() => prepareSlidesForStorage([oldSlide]));
});
