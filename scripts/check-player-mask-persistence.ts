import assert from "node:assert/strict";
import { prepareSlidesForStorage } from "../utils/presentationData";
import { createSlide } from "../utils/slideFactory";

const slide = createSlide("video", 0);
assert.equal(slide.content.kind, "video");
if (slide.content.kind !== "video") process.exit(1);

const bounds = { x: 0.1, y: 0.2, width: 0.05, height: 0.2 };
slide.content.playerTracks = [{
  id: "track-1",
  name: "Jogador 1",
  source: "automatic",
  status: "ready",
  samples: [{
    time: 1,
    bbox: bounds,
    foot: { x: 0.125, y: 0.4 },
    confidence: 0.8,
    mask: {
      bounds,
      maskDataUrl: "data:image/png;base64,MASK",
      cutoutDataUrl: "data:image/png;base64,CUTOUT",
      width: 20,
      height: 80,
      frameTime: 1,
      quality: 0.75,
      method: "bodypix-instance",
    },
  }],
}];

const [storedSlide] = prepareSlidesForStorage([slide]);
assert.equal(storedSlide.content.kind, "video");
if (storedSlide.content.kind !== "video") process.exit(1);

const storedMask = storedSlide.content.playerTracks?.[0]?.samples[0]?.mask;
assert.equal(storedMask?.maskDataUrl, "data:image/png;base64,MASK");
assert.equal(storedMask.cutoutDataUrl, "data:image/png;base64,CUTOUT");

console.log("Player mask persistence: OK");
