"use client";

import { decodeMaskToRaster } from "@meta-sam/parser";
import { memo, useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import type { PlayerTrack, SamTrackingFrame } from "@/types/drawing";
import {
  samTrackedPlayerFrameStateAtTime,
  samTrackedPlayerStateAtTime,
  samTrackedPlayerTrajectoryDiagnostics,
} from "@/utils/samTrackedPlayer";
import { resolveSamTrackingFrameAtTime } from "@/utils/samTracking";

interface Props {
  playerTracks?: PlayerTrack[];
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
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

export const SamTrackingOverlayCanvas = memo(function SamTrackingOverlayCanvas({ playerTracks, width, height, getVideoElement, onPrepared }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const lastDiagnosticRef = useRef("");
  const debugEnabled = process.env.NODE_ENV !== "production"
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("samTrackingDebug");

  useEffect(() => {
    // Decode once when tracking arrives, not inside a time-critical frame render.
    const startedAt = performance.now();
    let frameCount = 0;
    for (const track of playerTracks ?? []) {
      for (const frame of track.samTracking?.frames ?? []) {
        try { coloredMask(frame); frameCount += 1; } catch { /* Invalid persisted masks remain safely invisible. */ }
      }
    }
    if (frameCount) onPrepared?.({ durationMs: performance.now() - startedAt, frameCount });
  }, [onPrepared, playerTracks]);

  useEffect(() => {
    if (!debugEnabled) return;
    for (const track of playerTracks ?? []) {
      const diagnostics = samTrackedPlayerTrajectoryDiagnostics(track);
      if (diagnostics) console.debug(`[SAM trajectory] ${track.name}`, diagnostics);
    }
  }, [debugEnabled, playerTracks]);

  const drawAtTime = useCallback((timelineTime: number, mediaTime?: number) => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    let diagnostic = "sem mascara neste fotograma";
    for (const track of playerTracks ?? []) {
      // The mask overlay and every SAM-following drawing (including the Ring)
      // consume this exact state. Separate render layers can no longer resolve
      // different tracking frames for the same presented video frame.
      const frameState = samTrackedPlayerFrameStateAtTime(track, timelineTime);
      if (!frameState) {
        const resolution = resolveSamTrackingFrameAtTime(track.samTracking, timelineTime);
        if (resolution.expectedFrameIndex !== undefined) {
          diagnostic = `video ${timelineTime.toFixed(4)}s${mediaTime === undefined ? "" : ` | mediaTime ${mediaTime.toFixed(4)}s`} | sem mascara | frame esperado ${resolution.expectedFrameIndex} | causa ${resolution.mode}`;
        }
        continue;
      }
      const { frame, bounds, resolution } = frameState;
      const playerState = samTrackedPlayerStateAtTime(track, timelineTime);
      const foot = playerState?.foot;
      const rawFoot = playerState?.rawFoot;
      // Confirmed masks remain available to tracking, occlusion and the Ring,
      // but are no longer painted over the video. The user already reviewed
      // the green preview before confirming the identification.
      const deltaMs = (timelineTime - frame.time) * 1_000;
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const interpolation = resolution.mode === "interpolated"
        ? ` | interpolado ${resolution.beforeFrameIndex}->${resolution.afterFrameIndex} para ${resolution.expectedFrameIndex}`
        : "";
      diagnostic = `video ${timelineTime.toFixed(4)}s${mediaTime === undefined ? "" : ` | mediaTime ${mediaTime.toFixed(4)}s`} | SAM frame ${frame.frameIndex} | mascara ${frame.time.toFixed(4)}s | delta ${deltaMs.toFixed(1)}ms | centro ${center.x.toFixed(4)},${center.y.toFixed(4)} | pe bruto ${rawFoot ? `${rawFoot.x.toFixed(4)},${rawFoot.y.toFixed(4)}` : "indisponivel"} | Anel ${foot ? `${foot.x.toFixed(4)},${foot.y.toFixed(4)}` : "indisponivel"} | FPS ${track.samTracking?.frameRate.toFixed(2) ?? "-"}${interpolation}`;
    }
    if (debugRef.current) debugRef.current.textContent = diagnostic;
    if (debugEnabled && diagnostic !== lastDiagnosticRef.current) {
      if (diagnostic.includes("sem mascara") || diagnostic.includes("interpolado")) console.debug(`[SAM tracking] ${diagnostic}`);
      lastDiagnosticRef.current = diagnostic;
    }
  }, [debugEnabled, height, playerTracks, width]);

  useEffect(() => {
    const drawPresentedTime = (time: number) => {
      const video = getVideoElement?.();
      drawAtTime(time, video?.currentTime);
    };
    // Subscribe directly to the single presented-frame clock. This avoids
    // waiting for a full DrawingCanvas React render before painting the mask.
    drawPresentedTime(useEditorStore.getState().currentTime);
    return useEditorStore.subscribe((state, previous) => {
      if (state.currentTime !== previous.currentTime) drawPresentedTime(state.currentTime);
    });
  }, [drawAtTime, getVideoElement]);

  return <>
    <canvas ref={ref} className="sam-tracking-overlay" aria-hidden="true" />
    {debugEnabled && <div ref={debugRef} className="sam-tracking-debug">A aguardar fotograma...</div>}
  </>;
});
