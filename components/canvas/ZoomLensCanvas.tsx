"use client";

import { forwardRef, useEffect } from "react";
import type { DrawingObject } from "@/types/drawing";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";

interface Props {
  drawings: DrawingObject[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
}

export const ZoomLensCanvas = forwardRef<HTMLCanvasElement, Props>(function ZoomLensCanvas({ drawings, currentTime, width, height, getVideoElement }, ref) {
  useEffect(() => {
    const canvas = typeof ref === "object" ? ref?.current : null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const video = getVideoElement?.();
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    for (const drawing of drawings) {
      if (drawing.data.kind !== "zoom") continue;
      const temporalState = getObjectStateAtTime(drawing, currentTime);
      if (!temporalState.visible) continue;

      const scale = (Math.abs(temporalState.transform.scaleX) + Math.abs(temporalState.transform.scaleY)) / 2;
      const radius = Math.max(18, drawing.data.radius * Math.min(width, height) * scale);
      const centerX = (drawing.data.center.x + temporalState.transform.x) * width;
      const centerY = (drawing.data.center.y + temporalState.transform.y) * height;
      const zoom = Math.max(1.1, drawing.data.zoom);
      const sourceRadiusX = radius / Math.max(.001, width / video.videoWidth) / zoom;
      const sourceRadiusY = radius / Math.max(.001, height / video.videoHeight) / zoom;
      const sourceCenterX = centerX / width * video.videoWidth;
      const sourceCenterY = centerY / height * video.videoHeight;
      const sourceX = Math.max(0, Math.min(video.videoWidth - sourceRadiusX * 2, sourceCenterX - sourceRadiusX));
      const sourceY = Math.max(0, Math.min(video.videoHeight - sourceRadiusY * 2, sourceCenterY - sourceRadiusY));

      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.clip();
      try {
        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceRadiusX * 2,
          sourceRadiusY * 2,
          centerX - radius,
          centerY - radius,
          radius * 2,
          radius * 2,
        );
      } catch {
        context.fillStyle = "rgba(255,255,255,.08)";
        context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
      }
      const vignette = context.createRadialGradient(centerX, centerY, radius * .62, centerX, centerY, radius);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(.82, "rgba(0,0,0,.03)");
      vignette.addColorStop(1, "rgba(0,0,0,.22)");
      context.fillStyle = vignette;
      context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
      context.restore();

      context.save();
      context.globalAlpha = temporalState.opacity;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.strokeStyle = drawing.style.stroke;
      context.lineWidth = Math.max(2, drawing.style.strokeWidth);
      context.shadowColor = drawing.style.shadowColor || "#000000";
      context.shadowBlur = Math.max(8, drawing.style.shadowBlur);
      context.shadowOffsetX = drawing.style.shadowOffsetX;
      context.shadowOffsetY = drawing.style.shadowOffsetY;
      context.stroke();
      context.beginPath();
      context.arc(centerX - radius * .13, centerY - radius * .13, radius * .88, Math.PI * 1.08, Math.PI * 1.7);
      context.strokeStyle = "rgba(255,255,255,.72)";
      context.lineWidth = Math.max(1, drawing.style.strokeWidth * .32);
      context.shadowColor = "transparent";
      context.stroke();
      context.restore();
    }
  }, [currentTime, drawings, getVideoElement, height, ref, width]);

  return <canvas ref={ref} className="zoom-lens-canvas" width={width} height={height} />;
});
