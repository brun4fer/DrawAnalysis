import assert from "node:assert/strict";
import { analyseManualMaskAlpha, displayedPointToFrame } from "../utils/playerManualMask";

const width = 12;
const height = 16;
const alpha = new Uint8ClampedArray(width * height);
const paint = (x: number, y: number) => { alpha[y * width + x] = 255; };

// Head and torso.
for (let y = 2; y <= 9; y += 1) {
  for (let x = 4; x <= 7; x += 1) paint(x, y);
}
// Two independent legs, preserving their transparent gap.
for (let y = 10; y <= 14; y += 1) {
  paint(4, y);
  paint(7, y);
}

const result = analyseManualMaskAlpha(alpha, width, height);
assert.ok(result);
assert.deepEqual(result.pixelBounds, { x: 4, y: 2, width: 4, height: 13 });
assert.equal(result.bbox.x, 4 / width);
assert.equal(result.bbox.y, 2 / height);
assert.equal(result.bbox.width, 4 / width);
assert.equal(result.bbox.height, 13 / height);
assert.equal(result.foot.y, 14.5 / height);
assert.ok(result.foot.x >= 4 / width && result.foot.x <= 8 / width);
assert.equal(alpha[13 * width + 5], 0, "the gap between the legs must remain transparent");

assert.equal(analyseManualMaskAlpha(new Uint8ClampedArray(9), 3, 3), null);

const mappedCenter = displayedPointToFrame(
  { x: 420, y: 230 },
  { left: 100, top: 50, width: 640, height: 360 },
  1280,
  720,
);
assert.deepEqual(mappedCenter, { x: 640, y: 360 }, "display coordinates must scale to the original video frame");
const mappedZoomedPoint = displayedPointToFrame(
  { x: 580, y: 320 },
  { left: 100, top: 50, width: 960, height: 540 },
  1280,
  720,
);
assert.deepEqual(mappedZoomedPoint, { x: 640, y: 360 }, "CSS zoom must not change the saved frame coordinate");
console.log("Manual player mask geometry: OK");
