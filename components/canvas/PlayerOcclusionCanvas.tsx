"use client";

import { forwardRef, useEffect } from "react";
import type { DrawingObject, PlayerTrack } from "@/types/drawing";
import { drawPlayerForeground } from "@/utils/playerOcclusion";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
}

export const PlayerOcclusionCanvas = forwardRef<HTMLCanvasElement, Props>(function PlayerOcclusionCanvas({ drawings, playerTracks, currentTime, width, height, getVideoElement }, ref) {
  useEffect(() => {
    const canvas = typeof ref === "object" ? ref?.current : null;
    const video = getVideoElement?.();
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !context || !video.videoWidth || !video.videoHeight) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const drawing of drawings) {
      if (drawing.type !== "playerRing" || drawing.target?.kind !== "player") continue;
      if (currentTime < drawing.startTime || currentTime > drawing.endTime) continue;
      const track = playerTracks?.find((item) => item.id === drawing.target?.trackId);
      if (!track?.samples.length) continue;
      const sample = track.samples.reduce((nearest, item) => Math.abs(item.time - currentTime) < Math.abs(nearest.time - currentTime) ? item : nearest);
      if (drawing.data.kind !== "playerRing") continue;
      try {
        drawPlayerForeground(context, video, sample.bbox, width, height, sample.foot, drawing.data.radiusY);
      } catch {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [currentTime, drawings, getVideoElement, height, playerTracks, ref, width]);

  return <canvas ref={ref} className="player-occlusion-canvas" width={width} height={height} />;
});
