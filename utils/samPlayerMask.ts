import { decodeMaskToRaster } from "@meta-sam/parser";
import type { PlayerTrackSample } from "@/types/drawing";
import type { SamSegmentResult } from "@/types/sam";
import { buildManualPlayerSample } from "@/utils/playerManualMask";

export interface SamMaskPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The official parser exposes right/bottom as half-open source-frame edges.
 * A SAM raster must therefore occupy exactly right-left by bottom-top pixels;
 * silently stretching a different raster would deform the confirmed mask.
 */
export function samMaskPlacement(result: SamSegmentResult): SamMaskPlacement | null {
  const { left, top, right, bottom } = result.bounds;
  const edges = [left, top, right, bottom];
  if (!edges.every(Number.isInteger)) return null;
  if (left < 0 || top < 0 || right <= left || bottom <= top) return null;
  if (right > result.frame.width || bottom > result.frame.height) return null;
  const width = right - left;
  const height = bottom - top;
  if (result.mask.width !== width || result.mask.height !== height) return null;
  return { left, top, width, height };
}

function rasterCanvas(result: SamSegmentResult) {
  const raster = decodeMaskToRaster(result.mask);
  if (!raster.some((value) => value === 1)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = result.mask.width;
  canvas.height = result.mask.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.createImageData(canvas.width, canvas.height);
  for (let index = 0; index < raster.length; index += 1) {
    const offset = index * 4;
    imageData.data[offset] = 255;
    imageData.data[offset + 1] = 255;
    imageData.data[offset + 2] = 255;
    imageData.data[offset + 3] = raster[index] ? 255 : 0;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function buildSamPlayerSample(
  frame: HTMLCanvasElement,
  result: SamSegmentResult,
  frameTime: number,
  analysisMs: number,
): PlayerTrackSample | null {
  if (result.frame.width !== frame.width || result.frame.height !== frame.height) return null;
  const placement = samMaskPlacement(result);
  if (!placement) return null;
  const decoded = rasterCanvas(result);
  if (!decoded) return null;
  const fullFrameMask = document.createElement("canvas");
  fullFrameMask.width = frame.width;
  fullFrameMask.height = frame.height;
  const context = fullFrameMask.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(decoded, placement.left, placement.top);
  const confidence = Math.max(0, Math.min(1, result.confidence ?? .8));
  return buildManualPlayerSample(frame, fullFrameMask, frameTime, {
    confidence,
    quality: confidence,
    analysisMs,
    method: "sam-3.1",
  });
}
