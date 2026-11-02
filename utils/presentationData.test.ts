import assert from "node:assert/strict";
import test from "node:test";
import { prepareSlidesForStorage } from "./presentationData";
import { createSlide } from "./slideFactory";

test("keeps compressed player and club images inside the saved profile", () => {
  const slide = createSlide("player-profile", 0);
  assert.equal(slide.content.kind, "player-profile");
  if (slide.content.kind !== "player-profile") return;
  slide.content.playerPhoto = "data:image/webp;base64,player";
  slide.content.clubCrest = "data:image/webp;base64,club";

  const [saved] = prepareSlidesForStorage([slide]);
  assert.equal(saved.content.kind, "player-profile");
  if (saved.content.kind !== "player-profile") return;
  assert.equal(saved.content.playerPhoto, slide.content.playerPhoto);
  assert.equal(saved.content.clubCrest, slide.content.clubCrest);
});
