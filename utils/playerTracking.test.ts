import assert from "node:assert/strict";
import test from "node:test";
import type { DrawingObject, PlayerTrack } from "@/types/drawing";
import { DEFAULT_STYLE, DEFAULT_TRANSFORM } from "@/types/drawing";
import { followsSamTracking } from "./playerTracking";

const track: PlayerTrack = {
  id: "sam-player",
  name: "Jogador 1",
  source: "manual",
  status: "ready",
  samples: [{
    time: 4,
    confidence: 1,
    foot: { x: .5, y: .7 },
    bbox: { x: .45, y: .4, width: .1, height: .3 },
  }],
  samTracking: {
    sourceStartTime: 4,
    startTime: 4,
    endTime: 7,
    duration: 3,
    frameRate: 25,
    sourceWidth: 1920,
    sourceHeight: 1080,
    frames: [],
  },
};

function ring(startTime = 4.2, endTime = 6.2): DrawingObject {
  return {
    id: "ring",
    name: "Ring",
    type: "playerRing",
    startTime,
    endTime,
    trackingEnabled: false,
    target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: { x: .5, y: .7 } },
    keyframes: [],
    style: DEFAULT_STYLE,
    transform: DEFAULT_TRANSFORM,
    data: { kind: "playerRing", center: { x: .5, y: .7 }, radiusX: .05, radiusY: .02 },
  };
}

test("treats a legacy Q Ring inside a SAM run as SAM-following", () => {
  assert.equal(followsSamTracking(ring(), [track]), true);
});

test("does not change a Ring outside the SAM run", () => {
  assert.equal(followsSamTracking(ring(8, 10), [track]), false);
});
