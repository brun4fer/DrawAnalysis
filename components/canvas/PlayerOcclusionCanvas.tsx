"use client";

import { forwardRef, useEffect } from "react";
import type { DrawingObject, PlayerTrack, PlayerTrackSample } from "@/types/drawing";
import { drawPlayerForeground } from "@/utils/playerOcclusion";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
}

function sampleAtTime(track: PlayerTrack, currentTime: number): PlayerTrackSample {
  const samples = [...track.samples].sort((left, right) => left.time - right.time);
  const rightIndex = samples.findIndex((sample) => sample.time >= currentTime);
  if (rightIndex < 0) return samples[samples.length - 1];
  if (rightIndex === 0) return samples[0];
  const left = samples[rightIndex - 1];
  const right = samples[rightIndex];
  if (right.time - left.time > .45) return left;
  const progress = Math.max(0, Math.min(1, (currentTime - left.time) / Math.max(.001, right.time - left.time)));
  const mix = (from: number, to: number) => from + (to - from) * progress;
  return {
    time: currentTime,
    confidence: mix(left.confidence, right.confidence),
    foot: { x: mix(left.foot.x, right.foot.x), y: mix(left.foot.y, right.foot.y) },
    bbox: {
      x: mix(left.bbox.x, right.bbox.x),
      y: mix(left.bbox.y, right.bbox.y),
      width: mix(left.bbox.width, right.bbox.width),
      height: mix(left.bbox.height, right.bbox.height),
    },
  };
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
      const sample = sampleAtTime(track, currentTime);
      if (drawing.data.kind !== "playerRing") continue;
      try {
        drawPlayerForeground(context, video, sample.bbox, width, height, sample.foot, drawing.data.radiusY, drawing.data.occlusionWidth);
      } catch {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [currentTime, drawings, getVideoElement, height, playerTracks, ref, width]);

  return <canvas ref={ref} className="player-occlusion-canvas" width={width} height={height} />;
});
