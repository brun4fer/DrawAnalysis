"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SlideBackgroundMediaType } from "@/types/slide";

interface Props {
  url?: string;
  type?: SlideBackgroundMediaType;
  playbackTime?: number;
  playing?: boolean;
}

function drawCover(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
}

export function SlideMediaBackground({ url, type, playbackTime, playing = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const controlled = playbackTime !== undefined;

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) drawCover(canvas, video);
  }, []);

  useEffect(() => {
    if (type !== "video") return;
    const paint = () => {
      drawFrame();
      frameRef.current = requestAnimationFrame(paint);
    };
    frameRef.current = requestAnimationFrame(paint);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [drawFrame, type, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || type !== "video" || !controlled || !Number.isFinite(video.duration)) return;
    const duration = Math.max(.05, video.duration);
    const target = Math.max(0, playbackTime % duration);
    if (Math.abs(video.currentTime - target) > .18) video.currentTime = target;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
    drawFrame();
  }, [controlled, drawFrame, playbackTime, playing, type, url]);

  if (!url) return null;
  if ((type ?? "image") === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <div className="slide-media-background" data-slide-background-media><img src={url} alt="" /></div>;
  }

  return (
    <div className="slide-media-background is-video" data-slide-background-media>
      <video
        ref={videoRef}
        src={url}
        muted
        loop
        playsInline
        preload="auto"
        autoPlay={!controlled || playing}
        onLoadedData={(event) => {
          const video = event.currentTarget;
          if (controlled && Number.isFinite(video.duration)) video.currentTime = Math.max(0, (playbackTime ?? 0) % Math.max(.05, video.duration));
          if (!controlled || playing) void video.play().catch(() => undefined);
          drawFrame();
        }}
        onSeeked={drawFrame}
      />
      <canvas ref={canvasRef} width={1280} height={720} />
    </div>
  );
}
