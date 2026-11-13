import assert from "node:assert/strict";
import test from "node:test";
import type { SamSegmentResult } from "@/types/sam";
import { prepareSlidesForStorage } from "./presentationData";
import { samMaskPlacement } from "./samPlayerMask";
import { createSlide } from "./slideFactory";

function result(overrides: Partial<SamSegmentResult> = {}): SamSegmentResult {
  return {
    frame: { width: 1920, height: 1080 },
    bounds: { left: 100, top: 200, right: 160, bottom: 360 },
    mask: { encoding: "one_bit", payload: "payload", width: 60, height: 160 },
    confidence: .94,
    ...overrides,
  };
}

test("uses the parser half-open right and bottom bounds without resizing", () => {
  assert.deepEqual(samMaskPlacement(result()), { left: 100, top: 200, width: 60, height: 160 });
});

test("rejects a raster whose dimensions do not exactly match its bounds", () => {
  assert.equal(samMaskPlacement(result({
    mask: { encoding: "one_bit", payload: "payload", width: 61, height: 160 },
  })), null);
});

test("rejects fractional or out-of-frame bounds", () => {
  assert.equal(samMaskPlacement(result({
    bounds: { left: 100.5, top: 200, right: 160, bottom: 360 },
  })), null);
  assert.equal(samMaskPlacement(result({
    bounds: { left: 1880, top: 200, right: 1940, bottom: 360 },
  })), null);
});

test("preserves the confirmed SAM mask and original PNG cutout when a project is saved", () => {
  const slide = createSlide("video", 0);
  assert.equal(slide.content.kind, "video");
  if (slide.content.kind !== "video") return;
  const bounds = { x: 100 / 1920, y: 200 / 1080, width: 60 / 1920, height: 160 / 1080 };
  slide.content.playerTracks = [{
    id: "sam-player",
    name: "Jogador 1",
    source: "automatic",
    status: "ready",
    samples: [{
      time: 1,
      bbox: bounds,
      foot: { x: 130 / 1920, y: 360 / 1080 },
      confidence: .94,
      mask: {
        bounds,
        maskDataUrl: "data:image/png;base64,SAM_MASK",
        cutoutDataUrl: "data:image/png;base64,SAM_ORIGINAL_CUTOUT",
        width: 60,
        height: 160,
        frameTime: 1,
        quality: .94,
        method: "sam-3.1",
      },
    }],
  }];

  const [saved] = prepareSlidesForStorage([slide]);
  assert.equal(saved.content.kind, "video");
  if (saved.content.kind !== "video") return;
  const storedMask = saved.content.playerTracks?.[0]?.samples[0]?.mask;
  assert.equal(storedMask?.method, "sam-3.1");
  assert.equal(storedMask?.maskDataUrl, "data:image/png;base64,SAM_MASK");
  assert.equal(storedMask?.cutoutDataUrl, "data:image/png;base64,SAM_ORIGINAL_CUTOUT");
  assert.deepEqual(storedMask?.bounds, bounds);
});
