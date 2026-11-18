import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerTrack } from "@/types/drawing";
import {
  pointHitsSamTrackedPlayerMask,
  robustMaskGroundContact,
  samTrackedPlayerMaskRuns,
  samTrackedPlayerMovement,
  samTrackedPlayerPath,
  samTrackedPlayerStateAtTime,
  samTrackedPlayerTrajectoryDiagnostics,
} from "./samTrackedPlayer";
import type { SamTrackedPlayerState } from "./samTrackedPlayer";

function raster(width: number, height: number, pixels: Array<[number, number]>) {
  const result = new Uint8Array(width * height);
  pixels.forEach(([x, y]) => { result[y * width + x] = 1; });
  return result;
}

test("ignores an isolated pixel below the supported feet", () => {
  const pixels: Array<[number, number]> = [];
  for (let y = 5; y <= 8; y += 1) {
    pixels.push([2, y], [3, y], [6, y], [7, y]);
  }
  pixels.push([9, 11]);
  const contact = robustMaskGroundContact(raster(12, 12, pixels), 12, 12);
  assert.ok(contact);
  assert.ok(contact.y > .7 && contact.y < .8, `expected supported feet near row 8, got ${contact.y}`);
});

test("centres the Ring between two separated legs", () => {
  const pixels: Array<[number, number]> = [];
  for (let y = 4; y <= 9; y += 1) {
    pixels.push([2, y], [3, y], [8, y], [9, y]);
  }
  const contact = robustMaskGroundContact(raster(12, 12, pixels), 12, 12);
  assert.ok(contact);
  assert.ok(Math.abs(contact.x - .5) < .06, `expected centre between legs, got ${contact.x}`);
  assert.equal(contact.y, 10 / 12);
});

test("does not alternate the Ring centre between feet during a running stride", () => {
  const leftFoot: Array<[number, number]> = [];
  const rightFoot: Array<[number, number]> = [];
  for (let y = 8; y <= 14; y += 1) {
    for (const x of [4, 5, 6, 13, 14, 15]) {
      leftFoot.push([x, y]);
      rightFoot.push([x, y]);
    }
  }
  for (let y = 15; y <= 18; y += 1) {
    for (const x of [4, 5, 6]) leftFoot.push([x, y]);
    for (const x of [13, 14, 15]) rightFoot.push([x, y]);
  }
  const left = robustMaskGroundContact(raster(20, 20, leftFoot), 20, 20);
  const right = robustMaskGroundContact(raster(20, 20, rightFoot), 20, 20);
  assert.ok(left && right);
  assert.ok(Math.abs(left.x - right.x) < .16, `expected stable lower-body centre, got ${left.x} -> ${right.x}`);
  assert.ok(Math.abs(left.x - .5) < .12 && Math.abs(right.x - .5) < .12,
    `the Ring must remain between both legs, got ${left.x} and ${right.x}`);
  assert.equal(left.y, right.y);
});

test("returns no contact for an empty or invalid mask", () => {
  assert.equal(robustMaskGroundContact(new Uint8Array(24), 6, 4), undefined);
  assert.equal(robustMaskGroundContact(new Uint8Array(1), 0, 0), undefined);
});

test("recognises a click on the current tracked SAM mask", () => {
  const state: SamTrackedPlayerState = {
    frame: {
      frameIndex: 0,
      time: 1,
      bounds: { x: .2, y: .1, width: .5, height: .5 },
      mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
    },
    bounds: { x: .2, y: .1, width: .5, height: .5 },
    rawFoot: { x: .4, y: .6 },
    foot: { x: .4, y: .6 },
    mode: "exact",
    resolution: {
      mode: "exact",
      expectedFrameIndex: 0,
      bounds: { x: .2, y: .1, width: .5, height: .5 },
    },
  };
  assert.equal(pointHitsSamTrackedPlayerMask(state, { x: .25, y: .15 }), true);
  assert.equal(pointHitsSamTrackedPlayerMask(state, { x: .9, y: .9 }), false);
  const runs = samTrackedPlayerMaskRuns(state);
  assert.ok(runs.length > 0);
  assert.ok(runs.every((run) => run.x >= state.bounds.x
    && run.y >= state.bounds.y
    && run.x + run.width <= state.bounds.x + state.bounds.width + Number.EPSILON
    && run.y + run.height <= state.bounds.y + state.bounds.height + Number.EPSILON));
});

test("rejects an isolated trajectory spike without adding temporal lag", () => {
  const times = [0, .04, .08, .12, .16];
  const positions = [.1, .12, .18, .16, .18];
  const track: PlayerTrack = {
    id: "tracked-player",
    name: "Tracked player",
    source: "automatic",
    status: "ready",
    samples: [{
      time: 0,
      bbox: { x: .1, y: .1, width: .2, height: .5 },
      foot: { x: .2, y: .6 },
      confidence: .9,
    }],
    samTracking: {
      sourceStartTime: 0,
      startTime: 0,
      endTime: .16,
      duration: 2,
      frameRate: 25,
      frameTimes: times,
      sourceWidth: 1000,
      sourceHeight: 500,
      frames: positions.map((x, frameIndex) => ({
        frameIndex,
        time: times[frameIndex],
        bounds: { x, y: .1, width: .2, height: .5 },
        mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
        confidence: .9,
      })),
    },
  };
  const state = samTrackedPlayerStateAtTime(track, times[2]);
  const diagnostics = samTrackedPlayerTrajectoryDiagnostics(track);
  assert.ok(state && diagnostics);
  assert.ok(Math.abs(state.foot.x - state.rawFoot.x) > .01, "isolated spike should be corrected");
  assert.ok(diagnostics.correctedOutliers >= 1);
  assert.ok(diagnostics.stableJitter < diagnostics.rawJitter);
});

test("preserves genuine acceleration instead of leaving the Ring behind", () => {
  const times = Array.from({ length: 9 }, (_, index) => index * .04);
  const track: PlayerTrack = {
    id: "accelerating-player",
    name: "Accelerating player",
    source: "automatic",
    status: "ready",
    samples: [{ time: 0, bbox: { x: .1, y: .2, width: .08, height: .16 }, foot: { x: .14, y: .36 }, confidence: .9 }],
    samTracking: {
      sourceStartTime: 0,
      startTime: 0,
      endTime: times[times.length - 1],
      duration: 2,
      frameRate: 25,
      frameTimes: times,
      sourceWidth: 1280,
      sourceHeight: 720,
      frames: times.map((time, frameIndex) => ({
        frameIndex,
        time,
        bounds: {
          x: .1 + frameIndex * .006 + frameIndex ** 2 * .0007,
          y: .2,
          width: .08,
          height: .16,
        },
        mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
        confidence: .9,
      })),
    },
  };

  for (let frameIndex = 2; frameIndex <= 6; frameIndex += 1) {
    const state = samTrackedPlayerStateAtTime(track, times[frameIndex]);
    assert.ok(state);
    const horizontalCorrectionPx = Math.abs(state.foot.x - state.rawFoot.x) * track.samTracking!.sourceWidth;
    assert.ok(horizontalCorrectionPx < .75, `acceleration must remain current-time aligned, got ${horizontalCorrectionPx}px`);
  }
});

test("interpolates the stabilised Ring path continuously between SAM frames", () => {
  const times = [0, .04, .08, .12, .16];
  const positions = [.1, .11, .12, .13, .14];
  const track: PlayerTrack = {
    id: "interpolated-player",
    name: "Interpolated player",
    source: "automatic",
    status: "ready",
    samples: [{ time: 0, bbox: { x: .1, y: .1, width: .2, height: .5 }, foot: { x: .2, y: .6 }, confidence: .9 }],
    samTracking: {
      sourceStartTime: 0,
      startTime: 0,
      endTime: .16,
      duration: 2,
      frameRate: 25,
      frameTimes: times,
      sourceWidth: 1000,
      sourceHeight: 500,
      frames: positions.map((x, frameIndex) => ({
        frameIndex,
        time: times[frameIndex],
        bounds: { x, y: .1, width: .2, height: .5 },
        mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
        confidence: .9,
      })),
    },
  };
  const before = samTrackedPlayerStateAtTime(track, .08);
  const halfway = samTrackedPlayerStateAtTime(track, .1);
  const after = samTrackedPlayerStateAtTime(track, .12);
  assert.ok(before && halfway && after);
  assert.ok(halfway.foot.x > before.foot.x && halfway.foot.x < after.foot.x);
  assert.ok(Math.abs(halfway.foot.x - (before.foot.x + after.foot.x) / 2) < 1e-6);
});

test("summarises the observed SAM movement from the saved stabilised trajectory", () => {
  const times = [0, .04, .08, .12];
  const track: PlayerTrack = {
    id: "movement-player",
    name: "Movement player",
    source: "automatic",
    status: "ready",
    samples: [{ time: 0, bbox: { x: .1, y: .2, width: .08, height: .16 }, foot: { x: .14, y: .36 }, confidence: .9 }],
    samTracking: {
      sourceStartTime: 0,
      startTime: 0,
      endTime: .12,
      duration: 2,
      frameRate: 25,
      frameTimes: times,
      sourceWidth: 1280,
      sourceHeight: 720,
      frames: times.map((time, frameIndex) => ({
        frameIndex,
        time,
        bounds: { x: .1 + frameIndex * .02, y: .2, width: .08, height: .16 },
        mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
      })),
    },
  };
  const movement = samTrackedPlayerMovement(track);
  assert.ok(movement);
  assert.ok(movement.end.x > movement.start.x, "the direction must use the saved real path");
  assert.ok(movement.distance > .04, "the distance must retain the observed extent");
});

test("exposes the saved stabilised foot path for a visual direction overlay", () => {
  const times = [0, .04, .08];
  const positions = [{ x: .1, y: .2 }, { x: .13, y: .2 }, { x: .16, y: .19 }];
  const track: PlayerTrack = {
    id: "path-player",
    name: "Path player",
    source: "automatic",
    status: "ready",
    samples: [{ time: 0, bbox: { x: .1, y: .2, width: .08, height: .16 }, foot: { x: .14, y: .36 }, confidence: .9 }],
    samTracking: {
      sourceStartTime: 0,
      startTime: 0,
      endTime: .08,
      duration: 2,
      frameRate: 25,
      frameTimes: times,
      sourceWidth: 1280,
      sourceHeight: 720,
      frames: positions.map((position, frameIndex) => ({
        frameIndex,
        time: times[frameIndex],
        bounds: { ...position, width: .08, height: .16 },
        mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
      })),
    },
  };
  const path = samTrackedPlayerPath(track);
  assert.equal(path.length, 3);
  assert.ok(path[1].foot.x > path[0].foot.x);
  assert.ok(path[2].foot.y < path[1].foot.y, "the overlay keeps real curvature from the SAM path");
});

test("suppresses subpixel tremor for a distant player without delaying horizontal movement", () => {
  const times = Array.from({ length: 11 }, (_, index) => index * .04);
  const verticalNoise = [0, .0018, -.0014, .0016, -.0017, .0015, -.0015, .0017, -.0013, .0014, 0];
  const track: PlayerTrack = {
    id: "distant-player",
    name: "Distant player",
    source: "automatic",
    status: "ready",
    samples: [{ time: 0, bbox: { x: .1, y: .2, width: .035, height: .055 }, foot: { x: .1175, y: .255 }, confidence: .9 }],
    samTracking: {
      sourceStartTime: 0,
      startTime: 0,
      endTime: times[times.length - 1],
      duration: 2,
      frameRate: 25,
      frameTimes: times,
      sourceWidth: 1280,
      sourceHeight: 720,
      frames: times.map((time, frameIndex) => ({
        frameIndex,
        time,
        bounds: {
          x: .1 + frameIndex * .004,
          y: .2 + frameIndex * .0003 + verticalNoise[frameIndex],
          width: .035,
          height: .055,
        },
        mask: { encoding: "one_bit", width: 5, height: 5, payload: "!!!!!(QO(0lu8?" },
        confidence: .9,
      })),
    },
  };
  const states = times.map((time) => samTrackedPlayerStateAtTime(track, time));
  assert.ok(states.every(Boolean));
  const secondDifference = (values: number[]) => values.slice(2).reduce((sum, value, index) =>
    sum + Math.abs(value - values[index + 1] * 2 + values[index]), 0);
  const rawVerticalRoughness = secondDifference(states.map((state) => state!.rawFoot.y * 720));
  const stableVerticalRoughness = secondDifference(states.map((state) => state!.foot.y * 720));
  assert.ok(stableVerticalRoughness < rawVerticalRoughness * .72,
    `expected less distant-player tremor, got ${rawVerticalRoughness}px -> ${stableVerticalRoughness}px`);
  states.forEach((state) => {
    assert.ok(Math.abs(state!.foot.x - state!.rawFoot.x) * 1280 < 1,
      "constant horizontal movement must remain current-time aligned");
  });
});
