import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductVariant, supportsPlayerProfile } from "./product";

test("normalizes both opponent-player variants", () => {
  assert.equal(normalizeProductVariant("individual-written-report"), "individual-written-report");
  assert.equal(normalizeProductVariant("opponent-player-written-report"), "individual-written-report");
  assert.equal(normalizeProductVariant("opponent-player-video-analysis"), "opponent-player-video-analysis");
  assert.equal(normalizeProductVariant("player-video-analysis"), "opponent-player-video-analysis");
});

test("normalizes the game review deployment aliases", () => {
  assert.equal(normalizeProductVariant("game-review"), "game-review");
  assert.equal(normalizeProductVariant("match-review"), "game-review");
});

test("normalizes our-player and training deployment aliases", () => {
  assert.equal(normalizeProductVariant("our-players-performance-report"), "our-player-performance-report");
  assert.equal(normalizeProductVariant("player-performance-report"), "our-player-performance-report");
  assert.equal(normalizeProductVariant("our-players-video-analysis"), "our-player-video-analysis");
  assert.equal(normalizeProductVariant("training-collective-video-analysis"), "collective-training-video-analysis");
  assert.equal(normalizeProductVariant("training-individual-video-analysis"), "individual-training-video-analysis");
});

test("only player products expose the player-profile slide", () => {
  assert.equal(supportsPlayerProfile("individual-written-report"), true);
  assert.equal(supportsPlayerProfile("opponent-player-video-analysis"), true);
  assert.equal(supportsPlayerProfile("our-player-performance-report"), true);
  assert.equal(supportsPlayerProfile("our-player-video-analysis"), true);
  assert.equal(supportsPlayerProfile("individual-training-video-analysis"), true);
  assert.equal(supportsPlayerProfile("collective-training-video-analysis"), false);
  assert.equal(supportsPlayerProfile("tactidraw"), false);
  assert.equal(supportsPlayerProfile("gameplan"), false);
  assert.equal(supportsPlayerProfile("game-review"), false);
  assert.equal(supportsPlayerProfile("written-report"), false);
});
