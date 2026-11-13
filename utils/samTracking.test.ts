import assert from "node:assert/strict";
import test from "node:test";
import type { SamTrackResult } from "@/types/samTracking";
import { prepareSlidesForStorage } from "./presentationData";
import { buildSamPlayerTracking, samTrackingFrameAtTime } from "./samTracking";
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
