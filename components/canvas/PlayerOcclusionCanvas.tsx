"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { DrawingObject, ObjectTransform, PlayerTrack } from "@/types/drawing";
import { drawMovedPlayer, drawPlayerForeground, hidePlayerOriginal, shouldCompositePlayerForeground } from "@/utils/playerOcclusion";
import { samplePlayerTrackAtTime, targetAvailableAtTime } from "@/utils/playerTracking";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.match(/^#([0-9a-f]{6})/i)?.[1];
  if (!hex) return color;
  const value = Number.parseInt(hex, 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function drawGroundLine(
  context: CanvasRenderingContext2D,
  drawing: DrawingObject,
  destination: { x: number; y: number },
  width: number,
  height: number,
  opacity: number,
) {
  if (drawing.data.kind !== "ghost") return;
  const originX = drawing.data.origin.x * width;
  const originY = drawing.data.origin.y * height;
  const destinationX = destination.x * width;
  const destinationY = destination.y * height;
  const deltaX = destinationX - originX;
  const deltaY = destinationY - originY;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 2) return;

  const color = drawing.style.stroke.match(/^#[0-9a-f]{6}/i)?.[0] ?? "#ffffff";
  const strokeWidth = Math.max(2, drawing.style.strokeWidth);

  const path = () => {
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(destinationX, destinationY);
  };

  context.save();
  context.globalAlpha = opacity;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(drawing.style.dash);
  if (drawing.data.showArrow !== false) {
    path();
    context.strokeStyle = color;
    context.lineWidth = strokeWidth;
    context.stroke();
  }

  if (drawing.data.showOrigin === true) {
    const radiusX = Math.max(10, drawing.data.radiusX * width * 1.45);
    const radiusY = Math.max(3.5, radiusX * .26);
    context.setLineDash(drawing.style.dash.length ? drawing.style.dash : [8, 6]);
    context.beginPath();
    context.ellipse(originX, originY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fillStyle = colorWithAlpha(color, .08);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, strokeWidth * .7);
    context.stroke();
  }
  context.restore();
}

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  width: number;
  height: number;
  /** Timeline owned by the caller (preview/export/editor). */
  currentTime?: number;
  getVideoElement?: () => HTMLVideoElement | null;
  transformOverrides?: Record<string, ObjectTransform>;
  editingPreview?: boolean;
}

export const PlayerOcclusionCanvas = forwardRef<HTMLCanvasElement, Props>(function PlayerOcclusionCanvas({ drawings, playerTracks, width, height, currentTime, getVideoElement, transformOverrides, editingPreview = false }, ref) {
  const [maskRevision, setMaskRevision] = useState(0);
  const lastRenderTimeRef = useRef(0);
  const redrawLoadedMask = useCallback(() => setMaskRevision((revision) => revision + 1), []);
  const drawAtTime = useCallback((renderTime: number) => {
    lastRenderTimeRef.current = renderTime;
    const canvas = typeof ref === "object" ? ref?.current : null;
    const video = getVideoElement?.();
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !context || !video.videoWidth || !video.videoHeight) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const activeTargets = drawings.filter((drawing) => getObjectStateAtTime(drawing, renderTime).visible && targetAvailableAtTime(drawing, playerTracks, renderTime));
    const trackIds = [...new Set(activeTargets.flatMap((drawing) => {
      const ids: string[] = [];
      // The dark spotlight intentionally does not redraw its target. Every
      // other player-bound drawing, especially a ring, needs the static
      // foreground cutout so that the player remains above the graphic.
      if (drawing.target?.kind === "player" && drawing.data.kind !== "spotlight") ids.push(drawing.target.trackId);
      if (drawing.data.kind === "line") {
        if (drawing.data.startTarget?.trackId) ids.push(drawing.data.startTarget.trackId);
        if (drawing.data.endTarget?.trackId) ids.push(drawing.data.endTarget.trackId);
        drawing.data.pointTargets?.forEach((target) => { if (target?.trackId) ids.push(target.trackId); });
      }
      return ids;
    }))];
    for (const trackId of trackIds) {
      const track = playerTracks?.find((item) => item.id === trackId);
      if (!track?.samples.length) continue;
      const sample = samplePlayerTrackAtTime(track, renderTime);
      if (!shouldCompositePlayerForeground(activeTargets, trackId, sample.mask)) continue;
      const identification = activeTargets.find((drawing) => drawing.data.kind === "identifyPlayer" && drawing.target?.trackId === trackId);
      const effectOpacity = identification
        ? editingPreview ? identification.style.opacity : getObjectStateAtTime(identification, renderTime).opacity
        : 1;
      try {
        drawPlayerForeground(context, video, sample.bbox, width, height, sample.foot, sample.mask, identification?.style, effectOpacity, redrawLoadedMask);
      } catch {
        // Keep the remaining identified players visible if one frame cannot be sampled.
      }
    }

    for (const drawing of drawings) {
      if (drawing.data.kind !== "ghost" || drawing.target?.kind !== "player") continue;
      const state = getObjectStateAtTime(drawing, renderTime);
      if (!state.visible) continue;
      const track = playerTracks?.find((item) => item.id === drawing.target?.trackId);
      if (!track?.samples.length) continue;
      const sample = samplePlayerTrackAtTime(track, renderTime);
      const transform = transformOverrides?.[drawing.id] ?? state.transform;
      const finalDestination = {
        x: drawing.data.destination.x + transform.x,
        y: drawing.data.destination.y + transform.y,
      };
      const objectDuration = Math.max(.04, drawing.endTime - drawing.startTime);
      const travelDuration = Math.min(objectDuration / (drawing.data.returnToOrigin ? 2 : 1), Math.max(.12, drawing.data.travelDuration ?? .7));
      const elapsed = Math.max(0, renderTime - drawing.startTime);
      const ease = (value: number) => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;
      let travelProgress = editingPreview || drawing.data.animateMovement === false ? 1 : ease(elapsed / travelDuration);
      if (!editingPreview && drawing.data.animateMovement !== false && drawing.data.returnToOrigin && renderTime > drawing.endTime - travelDuration) {
        travelProgress = 1 - ease((renderTime - (drawing.endTime - travelDuration)) / travelDuration);
      }
      const destination = {
        x: drawing.data.origin.x + (finalDestination.x - drawing.data.origin.x) * travelProgress,
        y: drawing.data.origin.y + (finalDestination.y - drawing.data.origin.y) * travelProgress,
      };
      try {
        if (drawing.data.hideOriginal !== false) hidePlayerOriginal(context, video, sample.bbox, width, height);
        drawGroundLine(context, drawing, destination, width, height, editingPreview ? drawing.style.opacity : state.opacity);
        drawMovedPlayer(
          context,
          video,
          sample.bbox,
          width,
          height,
          destination,
          transform.scaleX,
          transform.scaleY,
          transform.rotation,
          (editingPreview ? drawing.style.opacity : state.opacity) * (drawing.data.playerOpacity ?? .96),
          sample.mask,
          sample.foot,
          redrawLoadedMask,
        );
      } catch {
        // The next video frame redraws this overlay automatically.
      }
    }
  }, [drawings, editingPreview, getVideoElement, height, playerTracks, redrawLoadedMask, ref, transformOverrides, width]);

  useEffect(() => {
    // Mask PNGs are loaded asynchronously. Redraw the same decoded video
    // frame once one becomes available instead of waiting for the next tick.
    if (maskRevision > 0) drawAtTime(lastRenderTimeRef.current);
  }, [drawAtTime, maskRevision]);

  useEffect(() => {
    // Preview and export own their playback clock. Rendering from the global
    // editor clock left this layer on an old frame after a seek or pause.
    if (currentTime !== undefined) {
      drawAtTime(currentTime);
      return;
    }
    // The editor still intentionally follows its shared timeline.
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    void import("@/store/useEditorStore").then(({ useEditorStore }) => {
      if (disposed) return;
      drawAtTime(useEditorStore.getState().currentTime);
      unsubscribe = useEditorStore.subscribe((state, previous) => {
        if (state.currentTime !== previous.currentTime) drawAtTime(state.currentTime);
      });
    });
    return () => { disposed = true; unsubscribe?.(); };
  }, [currentTime, drawAtTime]);

  useEffect(() => {
    if (currentTime === undefined) return;
    const video = getVideoElement?.();
    if (!video) return;
    // A seek is asynchronous: drawing only when React updates the timeline can
    // composite the player cutout over the previous decoded video frame.
    const redrawDecodedFrame = () => drawAtTime(currentTime);
    video.addEventListener("loadeddata", redrawDecodedFrame);
    video.addEventListener("seeked", redrawDecodedFrame);
    video.addEventListener("timeupdate", redrawDecodedFrame);
    video.addEventListener("pause", redrawDecodedFrame);
    return () => {
      video.removeEventListener("loadeddata", redrawDecodedFrame);
      video.removeEventListener("seeked", redrawDecodedFrame);
      video.removeEventListener("timeupdate", redrawDecodedFrame);
      video.removeEventListener("pause", redrawDecodedFrame);
    };
  }, [currentTime, drawAtTime, getVideoElement]);

  return <canvas ref={ref} className="player-occlusion-canvas" width={width} height={height} />;
});
