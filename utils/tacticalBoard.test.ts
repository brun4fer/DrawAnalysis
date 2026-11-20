import test from "node:test";
import assert from "node:assert/strict";
import { resolveTacticalMarkTransition, resolvedTacticalMark } from "./tacticalBoard";
import type { TacticalBoardMark } from "@/types/slide";

const linkedLine: TacticalBoardMark = {
  id: "line", type: "player-link", playerIds: ["left", "right"], points: [],
  color: "#fff", fillColor: "#fff", strokeWidth: 4, opacity: 1,
};

test("linked tactical marks resolve their vertices from stable player ids", () => {
  const resolved = resolvedTacticalMark(linkedLine, { left: { x: .2, y: .3 }, right: { x: .8, y: .7 } });
  assert.deepEqual(resolved.points, [{ x: .2, y: .3 }, { x: .8, y: .7 }]);
});

test("new arrows reveal progressively and removed marks fade", () => {
  const arrow: TacticalBoardMark = { ...linkedLine, id: "arrow", type: "arrow", points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] };
  const entering = resolveTacticalMarkTransition([], [arrow], .5, false);
  assert.equal(entering.opacities.arrow, .5);
  assert.equal(entering.reveals.arrow, .5);
  const leaving = resolveTacticalMarkTransition([arrow], [], .5, false);
  assert.equal(leaving.opacities.arrow, .5);
});

test("new-stage drawings wait for the movement while removed drawings fade with it", () => {
  const arrow: TacticalBoardMark = { ...linkedLine, id: "arrow", type: "arrow", points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] };
  const next = resolveTacticalMarkTransition([arrow], [], 0, true, .5);
  assert.equal(next.opacities.arrow, .5);
  const deferred = resolveTacticalMarkTransition([], [arrow], 0, true, .5);
  assert.equal(deferred.opacities.arrow, 0);
  assert.equal(deferred.reveals.arrow, 0);
});
