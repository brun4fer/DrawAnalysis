"use client";

import { decodeMaskToRaster } from "@meta-sam/parser";
import { useEffect, useRef } from "react";
import type { PlayerTrack, SamTrackingFrame } from "@/types/drawing";
import { samTrackingFrameAtTime } from "@/utils/samTracking";

interface Props {
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
}

const rasterCache = new Map<string, HTMLCanvasElement>();

function coloredMask(frame: SamTrackingFrame) {
  const key = `${frame.mask.encoding}:${frame.mask.width}x${frame.mask.height}:${frame.mask.payload}`;
  const cached = rasterCache.get(key);
  if (cached) return cached;
  const raster = decodeMaskToRaster(frame.mask);
  const canvas = document.createElement("canvas");
  canvas.width = frame.mask.width;
  canvas.height = frame.mask.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let index = 0; index < raster.length; index += 1) {
    if (!raster[index]) continue;
    const offset = index * 4;
    image.data[offset] = 163;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 18;
    image.data[offset + 3] = 112;
  }
  context.putImageData(image, 0, 0);
  rasterCache.set(key, canvas);
  if (rasterCache.size > 240) rasterCache.delete(rasterCache.keys().next().value as string);
  return canvas;
}

export function SamTrackingOverlayCanvas({ playerTracks, currentTime, width, height }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const track of playerTracks ?? []) {
      const frame = samTrackingFrameAtTime(track.samTracking, currentTime);
      if (!frame) continue;
      try {
        const mask = coloredMask(frame);
        if (!mask) continue;
        const x = frame.bounds.x * canvas.width;
        const y = frame.bounds.y * canvas.height;
        const targetWidth = frame.bounds.width * canvas.width;
        const targetHeight = frame.bounds.height * canvas.height;
        context.imageSmoothingEnabled = false;
        context.drawImage(mask, x, y, targetWidth, targetHeight);
        context.save();
        context.globalAlpha = .9;
        context.strokeStyle = "#a3ff12";
        context.lineWidth = Math.max(1.25, canvas.width / 900);
        context.shadowColor = "#a3ff12";
        context.shadowBlur = 4;
        context.strokeRect(x, y, targetWidth, targetHeight);
        context.restore();
      } catch {
        // A corrupt persisted mask is skipped without blocking the editor.
      }
    }
  }, [currentTime, height, playerTracks, width]);
  return <canvas ref={ref} className="sam-tracking-overlay" aria-hidden="true" />;
}
