import assert from "node:assert/strict";
import test from "node:test";
import { clampPitchPosition, createTrainingExerciseObject } from "./training-exercise";

test("training exercise objects use portable percentage coordinates", () => {
  const player = createTrainingExerciseObject("player");
  assert.equal(player.type, "player");
  assert.equal(player.x, 50);
  assert.equal(player.y, 50);
  assert.ok(player.id.length > 0);
});

test("training exercise positions stay inside the pitch", () => {
  assert.equal(clampPitchPosition(-10), 2);
  assert.equal(clampPitchPosition(120), 98);
  assert.equal(clampPitchPosition(43.5), 43.5);
});
