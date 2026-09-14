"use client";
/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { VideoSlideContent } from "@/types/slide";

const DrawingPreviewCanvas = dynamic(() => import("@/components/canvas/DrawingPreviewCanvas").then((module) => module.DrawingPreviewCanvas), { ssr: false });

interface Props { content: VideoSlideContent; slideName: string }

export function VideoSlidePreview({ content, slideName }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(content.startTime);
  const [aspect, setAspect] = useState(16 / 9);
  const [size, setSize] = useState({ width: 960, height: 540 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fit = () => {
      const bounds = container.getBoundingClientRect();
      let width = bounds.width;
      let height = width / aspect;
      if (height > bounds.height) { height = bounds.height; width = height * aspect; }
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    fit();
    return () => observer.disconnect();
  }, [aspect]);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
  }, []);

  const syncDrawings = () => {
    const video = videoRef.current;
    if (!video) return;
    const endTime = content.endTime ?? video.duration;
    if (video.currentTime >= endTime) {
      video.pause();
      video.currentTime = endTime;
      setCurrentTime(endTime);
      return;
    }
    setCurrentTime(video.currentTime);
    if (!video.paused) animationRef.current = requestAnimationFrame(syncDrawings);
  };

  if (!content.sourceUrl) {
    return (
      <div className="preview-video-slide">
        {content.thumbnail
          ? <img src={content.thumbnail} alt={slideName} />
          : <div><span>VIDEO / PLAY</span><strong>{content.fileName || "Vídeo local"}</strong><small>Abra o slide no editor para reproduzir.</small></div>}
      </div>
    );
  }

  return (
    <div className="preview-video-slide" ref={containerRef}>
      <div className="preview-video-frame" style={{ width: size.width, height: size.height }}>
        <video
          ref={videoRef}
          src={content.sourceUrl}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setAspect(video.videoWidth / video.videoHeight || 16 / 9);
            video.currentTime = content.startTime;
            setCurrentTime(content.startTime);
            void video.play().catch(() => undefined);
          }}
          onPlay={() => {
            if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
            animationRef.current = requestAnimationFrame(syncDrawings);
          }}
          onPause={() => {
            if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
            setCurrentTime(videoRef.current?.currentTime ?? content.startTime);
          }}
          onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
        />
        <div className="preview-drawing-overlay"><DrawingPreviewCanvas drawings={content.drawings} currentTime={currentTime} width={size.width} height={size.height} /></div>
      </div>
    </div>
  );
}
