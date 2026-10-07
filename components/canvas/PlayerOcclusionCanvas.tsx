"use client";

import { forwardRef, useEffect } from "react";
import type { DrawingObject, ObjectTransform, PlayerTrack } from "@/types/drawing";
import { drawMovedPlayer, drawPlayerForeground, hidePlayerOriginal } from "@/utils/playerOcclusion";
import { samplePlayerTrackAtTime } from "@/utils/playerTracking";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.match(/^#([0-9a-f]{6})/i)?.[1];
  if (!hex) return color;
  const value = Number.parseInt(hex, 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function drawGroundArrow(
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
  const angle = Math.atan2(deltaY, deltaX);
  const headLength = Math.max(11, strokeWidth * 2.5);
  const headWidth = Math.max(9, strokeWidth * 2.15);
  const tipX = destinationX;
  const tipY = destinationY;
  const baseX = tipX - Math.cos(angle) * headLength;
  const baseY = tipY - Math.sin(angle) * headLength;
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);

  const path = () => {
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(baseX, baseY);
    context.moveTo(baseX + normalX * headWidth / 2, baseY + normalY * headWidth / 2);
    context.lineTo(tipX, tipY);
    context.lineTo(baseX - normalX * headWidth / 2, baseY - normalY * headWidth / 2);
  };

  context.save();
  context.globalAlpha = opacity;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(drawing.style.dash);
  if (drawing.data.showArrow !== false) {
    context.save();
    context.translate(
      drawing.style.shadowOffsetX || 3,
      Math.max(3, drawing.style.shadowOffsetY || 4),
    );
    path();
    context.strokeStyle = colorWithAlpha("#000000", .52);
    context.lineWidth = strokeWidth + 3;
    context.shadowColor = "rgba(0,0,0,.75)";
    context.shadowBlur = Math.max(6, drawing.style.shadowBlur);
    context.stroke();
    context.restore();

    path();
    context.strokeStyle = color;
    context.lineWidth = strokeWidth;
    context.shadowColor = drawing.style.shadowColor;
    context.shadowBlur = drawing.style.shadowBlur;
    context.shadowOffsetX = drawing.style.shadowOffsetX;
    context.shadowOffsetY = drawing.style.shadowOffsetY;
    context.stroke();
  }

  if (drawing.data.showOrigin !== false) {
    const radiusX = Math.max(10, drawing.data.radiusX * width * 1.45);
    const radiusY = Math.max(3.5, radiusX * .26);
    context.shadowColor = "rgba(0,0,0,.7)";
    context.shadowBlur = 6;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 3;
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

    const activeTargets = drawings.filter((drawing) => getObjectStateAtTime(drawing, currentTime).visible);
    const trackIds = [...new Set(activeTargets.flatMap((drawing) => {
      const ids: string[] = [];
      if (drawing.target?.kind === "player") ids.push(drawing.target.trackId);
      if (drawing.data.kind === "line") {
        if (drawing.data.startTarget?.trackId) ids.push(drawing.data.startTarget.trackId);
        if (drawing.data.endTarget?.trackId) ids.push(drawing.data.endTarget.trackId);
      }
      return ids;
    }))];
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
        if (drawing.data.hideOriginal !== false) hidePlayerOriginal(context, video, sample.bbox, width, height);
        drawGroundArrow(context, drawing, destination, width, height, state.opacity);
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
