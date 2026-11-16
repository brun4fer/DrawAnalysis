import assert from "node:assert/strict";
import test from "node:test";
import type { DrawingData, DrawingObject, PlayerSegmentationMask } from "@/types/drawing";
import { DEFAULT_STYLE, DEFAULT_TRANSFORM } from "@/types/drawing";
import { shouldCompositePlayerForeground } from "./playerOcclusion";

const trackId = "sam-player";

function drawing(data: DrawingData, targetTrackId = trackId): DrawingObject {
  return {
    id: crypto.randomUUID(),
    name: data.kind,
    type: data.kind,
    startTime: 0,
    endTime: 3,
    trackingEnabled: false,
    target: { kind: "player", trackId: targetTrackId, anchor: "feet" },
    keyframes: [],
    style: DEFAULT_STYLE,
    transform: DEFAULT_TRANSFORM,
    data,
  } as DrawingObject;
}

const mask = (method: PlayerSegmentationMask["method"]): PlayerSegmentationMask => ({
  bounds: { x: .1, y: .1, width: .1, height: .3 },
  maskDataUrl: "data:image/png;base64,MASK",
  cutoutDataUrl: "data:image/png;base64,CUTOUT",
  width: 100,
  height: 300,
  frameTime: 1,
  quality: 1,
  method,
});

const identification = drawing({
  kind: "identifyPlayer",
  center: { x: .15, y: .4 },
  radiusX: .03,
  radiusY: .01,
});

test("keeps the original video visible for an identification-only SAM track", () => {
  assert.equal(shouldCompositePlayerForeground([identification], trackId, mask("sam-3.1")), false);
});

test("keeps existing manual identification composition unchanged", () => {
  assert.equal(shouldCompositePlayerForeground([identification], trackId, mask("manual")), true);
});

test("composites a confirmed SAM player when Ring needs foreground occlusion", () => {
  const ring = drawing({
    kind: "playerRing",
    center: { x: .15, y: .4 },
    radiusX: .03,
    radiusY: .01,
  });
  assert.equal(shouldCompositePlayerForeground([identification, ring], trackId, mask("sam-3.1")), true);
});

test("composites a confirmed SAM player when Ghost needs the cutout", () => {
  const ghost = drawing({
    kind: "ghost",
    origin: { x: .15, y: .4 },
    destination: { x: .4, y: .4 },
    radiusX: .03,
    radiusY: .01,
  });
  assert.equal(shouldCompositePlayerForeground([identification, ghost], trackId, mask("sam-3.1")), true);
});

test("does not composite for Spotlight, which intentionally leaves the target in the video", () => {
  const spotlight = drawing({
    kind: "spotlight",
    target: { x: .15, y: .3 },
    radiusX: .08,
    radiusY: .2,
    beamHeight: .4,
  });
  assert.equal(shouldCompositePlayerForeground([identification, spotlight], trackId, mask("sam-3.1")), false);
});

test("does not redraw a SAM player for an explicitly following Ring", () => {
  const ring = drawing({
    kind: "playerRing",
    center: { x: .15, y: .4 },
    radiusX: .03,
    radiusY: .01,
  });
  ring.target = { ...ring.target!, followSamTracking: true };
  assert.equal(shouldCompositePlayerForeground([identification, ring], trackId, mask("sam-3.1")), false);
});

test("leaves old Rings and Ghost composition unchanged", () => {
  const ring = drawing({
    kind: "playerRing",
    center: { x: .15, y: .4 },
    radiusX: .03,
    radiusY: .01,
  });
  const ghost = drawing({
    kind: "ghost",
    origin: { x: .15, y: .4 },
    destination: { x: .4, y: .4 },
    radiusX: .03,
    radiusY: .01,
  });
  assert.equal(shouldCompositePlayerForeground([identification, ring], trackId, mask("sam-3.1")), true);
  assert.equal(shouldCompositePlayerForeground([identification, ghost], trackId, mask("sam-3.1")), true);
});
