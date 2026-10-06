"use client";

import { forwardRef, useEffect } from "react";
import type { DrawingObject, ObjectTransform, PlayerTrack } from "@/types/drawing";
import { drawMovedPlayer, drawPlayerForeground, hidePlayerOriginal } from "@/utils/playerOcclusion";
import { samplePlayerTrackAtTime } from "@/utils/playerTracking";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
  transformOverrides?: Record<string, ObjectTransform>;
}

export const PlayerOcclusionCanvas = forwardRef<HTMLCanvasElement, Props>(function PlayerOcclusionCanvas({ drawings, playerTracks, currentTime, width, height, getVideoElement, transformOverrides }, ref) {
  useEffect(() => {
    const canvas = typeof ref === "object" ? ref?.current : null;
    const video = getVideoElement?.();
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !context || !video.videoWidth || !video.videoHeight) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const activeTargets = drawings.filter((drawing) => drawing.target?.kind === "player" && getObjectStateAtTime(drawing, currentTime).visible);
    const trackIds = [...new Set(activeTargets.map((drawing) => drawing.target?.trackId).filter((id): id is string => Boolean(id)))];
    for (const trackId of trackIds) {
      const track = playerTracks?.find((item) => item.id === trackId);
      if (!track?.samples.length) continue;
      const sample = samplePlayerTrackAtTime(track, currentTime);
      const ring = activeTargets.find((drawing) => drawing.target?.trackId === trackId && drawing.data.kind === "playerRing");
      const radiusY = ring?.data.kind === "playerRing" ? ring.data.radiusY : Math.max(.009, sample.bbox.width * .34);
      const occlusionWidth = ring?.data.kind === "playerRing" ? ring.data.occlusionWidth : sample.bbox.width;
      try {
        drawPlayerForeground(context, video, sample.bbox, width, height, sample.foot, radiusY, occlusionWidth);
      } catch {
        // Keep the remaining identified players visible if one frame cannot be sampled.
      }
    }

    for (const drawing of drawings) {
      if (drawing.data.kind !== "ghost" || drawing.target?.kind !== "player") continue;
      const state = getObjectStateAtTime(drawing, currentTime);
      if (!state.visible) continue;
      const track = playerTracks?.find((item) => item.id === drawing.target?.trackId);
      if (!track?.samples.length) continue;
      const sample = samplePlayerTrackAtTime(track, currentTime);
      const transform = transformOverrides?.[drawing.id] ?? state.transform;
      const destination = {
        x: drawing.data.destination.x + transform.x,
        y: drawing.data.destination.y + transform.y,
      };
      try {
        if (drawing.data.hideOriginal !== false) hidePlayerOriginal(context, video, sample.bbox, width, height, sample.foot);
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
          state.opacity * (drawing.data.playerOpacity ?? .96),
        );
      } catch {
        // The next video frame redraws this overlay automatically.
      }
    }
  }, [currentTime, drawings, getVideoElement, height, playerTracks, ref, transformOverrides, width]);

  return <canvas ref={ref} className="player-occlusion-canvas" width={width} height={height} />;
});
