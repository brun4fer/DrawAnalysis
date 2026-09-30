"use client";
/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FreezeFrame, VideoSlideContent } from "@/types/slide";
import { freezeRange, orderedFreezeFrames, sourceTimeToTimeline } from "@/utils/videoTimeline";

const DrawingPreviewCanvas = dynamic(() => import("@/components/canvas/DrawingPreviewCanvas").then((module) => module.DrawingPreviewCanvas), { ssr: false });

interface Props { content: VideoSlideContent; slideName: string }

export function VideoSlidePreview({ content, slideName }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const freezeAnimationRef = useRef<number | null>(null);
  const holdingFreezeRef = useRef(false);
  const completedFreezesRef = useRef<Set<string>>(new Set());
  const lastSourceTimeRef = useRef(content.startTime);
  const freezes = useMemo(() => orderedFreezeFrames(content.freezeFrames), [content.freezeFrames]);
  const [currentTime, setCurrentTime] = useState(sourceTimeToTimeline(content.startTime, freezes));
  const [aspect, setAspect] = useState(16 / 9);
  const [size, setSize] = useState({ width: 960, height: 540 });
  const getVideoElement = useCallback(() => videoRef.current, []);

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

  const cancelAnimations = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (freezeAnimationRef.current !== null) cancelAnimationFrame(freezeAnimationRef.current);
    animationRef.current = null;
    freezeAnimationRef.current = null;
    holdingFreezeRef.current = false;
  }, []);

  useEffect(() => () => cancelAnimations(), [cancelAnimations]);

  const playFreeze = (freeze: FreezeFrame) => {
    const video = videoRef.current;
    if (!video) return;
    const range = freezeRange(freeze, freezes);
    holdingFreezeRef.current = true;
    video.currentTime = freeze.sourceTime;
    video.pause();
    setCurrentTime(range.start);
    const startedAt = performance.now();
    const hold = (now: number) => {
      if (!holdingFreezeRef.current) return;
      const timelineTime = Math.min(range.end, range.start + (now - startedAt) / 1000);
      setCurrentTime(timelineTime);
      if (timelineTime >= range.end - .001) {
        holdingFreezeRef.current = false;
        freezeAnimationRef.current = null;
        completedFreezesRef.current.add(freeze.id);
        video.currentTime = Math.min(video.duration, freeze.sourceTime + .002);
        lastSourceTimeRef.current = video.currentTime;
        void video.play().catch(() => undefined);
        return;
      }
      freezeAnimationRef.current = requestAnimationFrame(hold);
    };
    freezeAnimationRef.current = requestAnimationFrame(hold);
  };

  const syncDrawings = () => {
    const video = videoRef.current;
    if (!video || holdingFreezeRef.current) return;
    const endTime = content.endTime ?? video.duration;
    if (video.currentTime >= endTime) {
      video.pause();
      video.currentTime = endTime;
      setCurrentTime(sourceTimeToTimeline(endTime, freezes));
      return;
    }
    const sourceTime = video.currentTime;
    const nextFreeze = freezes.find((freeze) => !completedFreezesRef.current.has(freeze.id)
      && freeze.sourceTime >= content.startTime
      && freeze.sourceTime < endTime
      && lastSourceTimeRef.current <= freeze.sourceTime + .01
      && sourceTime >= freeze.sourceTime - .012);
    lastSourceTimeRef.current = sourceTime;
    if (nextFreeze && !video.paused) {
      playFreeze(nextFreeze);
      return;
    }
    setCurrentTime(sourceTimeToTimeline(sourceTime, freezes));
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
          crossOrigin="anonymous"
          controls
          autoPlay
          playsInline
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setAspect(video.videoWidth / video.videoHeight || 16 / 9);
            video.currentTime = content.startTime;
            lastSourceTimeRef.current = content.startTime;
            completedFreezesRef.current.clear();
            setCurrentTime(sourceTimeToTimeline(content.startTime, freezes));
            void video.play().catch(() => undefined);
          }}
          onPlay={() => {
            if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
            animationRef.current = requestAnimationFrame(syncDrawings);
          }}
          onPause={() => {
            if (holdingFreezeRef.current) return;
            if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
            setCurrentTime(sourceTimeToTimeline(videoRef.current?.currentTime ?? content.startTime, freezes));
          }}
          onSeeked={(event) => {
            if (holdingFreezeRef.current) return;
            const sourceTime = event.currentTarget.currentTime;
            lastSourceTimeRef.current = sourceTime;
            completedFreezesRef.current = new Set(freezes.filter((freeze) => freeze.sourceTime < sourceTime).map((freeze) => freeze.id));
            setCurrentTime(sourceTimeToTimeline(sourceTime, freezes));
          }}
        />
        <div className="preview-drawing-overlay"><DrawingPreviewCanvas drawings={content.drawings} playerTracks={content.playerTracks} currentTime={currentTime} width={size.width} height={size.height} getVideoElement={getVideoElement} /></div>
      </div>
    </div>
  );
}
