import assert from "node:assert/strict";
import test from "node:test";
import { createSlide, formationNames, formationSlots } from "./slideFactory";

test("all supported formations contain eleven positions", () => {
  assert.deepEqual(formationNames, ["4-3-3", "4-2-3-1", "4-4-2", "3-4-3", "3-5-2", "5-3-2", "5-4-1"]);
  formationNames.forEach((formation) => assert.equal(formationSlots(formation).length, 11));
});

test("creates a complete editable player profile", () => {
  const slide = createSlide("player-profile", 0);
  assert.equal(slide.content.kind, "player-profile");
  if (slide.content.kind !== "player-profile") return;
  assert.equal(slide.content.formation, "4-3-3");
  assert.equal(slide.content.redCards, "0");
  assert.deepEqual(slide.content.playerPosition, formationSlots("4-3-3")[9].position);
});
