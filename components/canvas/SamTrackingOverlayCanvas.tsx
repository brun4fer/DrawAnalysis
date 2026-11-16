"use client";

import { decodeMaskToRaster } from "@meta-sam/parser";
import { useCallback, useEffect, useRef } from "react";
import type { PlayerTrack, SamTrackingFrame } from "@/types/drawing";
import { resolveSamTrackingFrameAtTime } from "@/utils/samTracking";
import { sourceTimeToTimeline } from "@/utils/videoTimeline";
import type { FreezeFrame } from "@/types/slide";

interface Props {
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
  freezeFrames?: FreezeFrame[];
  onPrepared?: (metrics: { durationMs: number; frameCount: number }) => void;
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

export function SamTrackingOverlayCanvas({ playerTracks, currentTime, width, height, getVideoElement, freezeFrames, onPrepared }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const lastDiagnosticRef = useRef("");
  const debugEnabled = process.env.NODE_ENV !== "production"
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("samTrackingDebug");

  useEffect(() => {
    // Decode once when tracking arrives, not inside a time-critical video-frame callback.
    const startedAt = performance.now();
    let frameCount = 0;
    for (const track of playerTracks ?? []) {
      for (const frame of track.samTracking?.frames ?? []) {
        try { coloredMask(frame); frameCount += 1; } catch { /* Invalid persisted masks remain safely invisible. */ }
      }
    }
    if (frameCount) onPrepared?.({ durationMs: performance.now() - startedAt, frameCount });
  }, [onPrepared, playerTracks]);

  const drawAtTime = useCallback((timelineTime: number, mediaTime?: number) => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    let diagnostic = "sem máscara neste fotograma";
    for (const track of playerTracks ?? []) {
      const resolution = resolveSamTrackingFrameAtTime(track.samTracking, timelineTime);
      const frame = resolution.frame;
      if (!frame) {
        if (resolution.expectedFrameIndex !== undefined) {
          diagnostic = `video ${timelineTime.toFixed(4)}s${mediaTime === undefined ? "" : ` · mediaTime ${mediaTime.toFixed(4)}s`} · sem máscara · frame esperado ${resolution.expectedFrameIndex} · causa ${resolution.mode}`;
        }
        continue;
      }
      try {
        const mask = coloredMask(frame);
        if (!mask) continue;
        const bounds = resolution.bounds ?? frame.bounds;
        const x = bounds.x * canvas.width;
        const y = bounds.y * canvas.height;
        const maskWidth = bounds.width * canvas.width;
        const maskHeight = bounds.height * canvas.height;
        context.imageSmoothingEnabled = false;
        context.drawImage(mask, x, y, maskWidth, maskHeight);
        context.save();
        context.globalAlpha = .9;
        context.strokeStyle = "#a3ff12";
        context.lineWidth = Math.max(1.25, canvas.width / 900);
        context.shadowColor = "#a3ff12";
        context.shadowBlur = 4;
        context.strokeRect(x, y, maskWidth, maskHeight);
        context.restore();
        const deltaMs = (timelineTime - frame.time) * 1_000;
        const interpolation = resolution.mode === "interpolated"
          ? ` · interpolado ${resolution.beforeFrameIndex}→${resolution.afterFrameIndex} para ${resolution.expectedFrameIndex}`
          : "";
        diagnostic = `video ${timelineTime.toFixed(4)}s${mediaTime === undefined ? "" : ` · mediaTime ${mediaTime.toFixed(4)}s`} · SAM frame ${frame.frameIndex} · máscara ${frame.time.toFixed(4)}s · Δ ${deltaMs.toFixed(1)}ms · FPS ${track.samTracking?.frameRate.toFixed(2) ?? "—"}${interpolation}`;
      } catch {
        // A corrupt persisted mask is skipped without blocking the editor.
      }
    }
    if (debugRef.current) debugRef.current.textContent = diagnostic;
    if (debugEnabled && diagnostic !== lastDiagnosticRef.current) {
      if (diagnostic.includes("sem máscara") || diagnostic.includes("interpolado")) console.debug(`[SAM tracking] ${diagnostic}`);
      lastDiagnosticRef.current = diagnostic;
    }
  }, [debugEnabled, height, playerTracks, width]);

  useEffect(() => {
    const video = getVideoElement?.();
    // During playback the video-frame callback below is the sole canvas writer. This prevents
    // a delayed React/Zustand effect from clearing a correctly rendered presented frame.
    if (video && !video.paused) return;
    drawAtTime(currentTime);
  }, [currentTime, drawAtTime, getVideoElement]);

  useEffect(() => {
    const video = getVideoElement?.();
    if (!video || typeof video.requestVideoFrameCallback !== "function") return;
    let callbackId = 0;
    const drawPresentedFrame: VideoFrameRequestCallback = (_now, metadata) => {
      drawAtTime(sourceTimeToTimeline(metadata.mediaTime, freezeFrames), metadata.mediaTime);
      callbackId = video.requestVideoFrameCallback(drawPresentedFrame);
    };
    callbackId = video.requestVideoFrameCallback(drawPresentedFrame);
    return () => video.cancelVideoFrameCallback(callbackId);
  }, [drawAtTime, freezeFrames, getVideoElement]);

  return <>
    <canvas ref={ref} className="sam-tracking-overlay" aria-hidden="true" />
    {debugEnabled && <div ref={debugRef} className="sam-tracking-debug">A aguardar fotograma…</div>}
  </>;
}
