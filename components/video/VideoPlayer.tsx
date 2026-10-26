"use client";

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from "react";
import { Film, Upload } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { FreezeFrame } from "@/types/slide";
import { freezeRange, getTimelineDuration, orderedFreezeFrames, sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";
import { VideoControls } from "./VideoControls";
import { hexToRgba } from "@/utils/color";

const DrawingCanvas = dynamic(() => import("@/components/canvas/DrawingCanvas").then((mod) => mod.DrawingCanvas), { ssr: false });

export interface VideoPlayerHandle {
  toggle: () => void;
  seekBy: (seconds: number) => void;
  frameBy: (frames: number) => void;
  captureFrame: () => string | null;
}

const DEFAULT_EDITOR_VIEWPORT = { zoom: 1, x: 0, y: 0 };
const MAX_EDITOR_ZOOM = 6;

interface Props {
  source: string | null;
  clipStart?: number;
  clipEnd?: number;
  freezeFrames?: FreezeFrame[];
  caption?: string;
  captionOpacity?: number;
  captionBackgroundColor?: string;
  captionTextColor?: string;
  captionFontSize?: number;
  captionHeight?: number;
  captionPositionY?: number;
  onChooseVideo: () => void;
  onDurationReady?: (duration: number) => void;
  onPlaybackError?: (message: string) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer({ source, clipStart = 0, clipEnd, freezeFrames, caption, captionOpacity = .74, captionBackgroundColor = "#ffffff", captionTextColor = "#101010", captionFontSize = 22, captionHeight = .075, captionPositionY = .9625, onChooseVideo, onDurationReady, onPlaybackError }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const drawingCaptureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const freezeAnimationRef = useRef<number | null>(null);
  const holdingFreezeRef = useRef(false);
  const completedFreezesRef = useRef<Set<string>>(new Set());
  const lastSourceTimeRef = useRef(0);
  const currentTimelineTimeRef = useRef(0);
  const [size, setSize] = useState({ width: 960, height: 540 });
  const [editorViewport, setEditorViewport] = useState(DEFAULT_EDITOR_VIEWPORT);
  const [aspect, setAspect] = useState(16 / 9);
  const [volume, setVolume] = useState(0.8);
  const [speed, setSpeed] = useState(1);
  const [sourceDuration, setSourceDuration] = useState(0);
  const { currentTime, duration, isPlaying, setCurrentTime, setDuration, setIsPlaying } = useEditorStore();
  const freezes = useMemo(() => orderedFreezeFrames(freezeFrames), [freezeFrames]);
  const clipStartTimeline = sourceTimeToTimeline(clipStart, freezes);
  const effectiveClipEndSource = Math.min(clipEnd ?? sourceDuration, sourceDuration || clipEnd || 0);
  const clipEndTimeline = sourceTimeToTimeline(effectiveClipEndSource, freezes);

  useEffect(() => { currentTimelineTimeRef.current = currentTime; }, [currentTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isPlaying && !holdingFreezeRef.current && video && !video.paused) video.pause();
  }, [isPlaying]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const resize = () => {
      const bounds = area.getBoundingClientRect();
      let width = bounds.width - 32;
      let height = width / aspect;
      if (height > bounds.height - 28) {
        height = bounds.height - 28;
        width = height * aspect;
      }
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    resize();
    return () => observer.disconnect();
  }, [aspect]);

  useEffect(() => {
    setEditorViewport((current) => {
      if (current.zoom <= 1) return DEFAULT_EDITOR_VIEWPORT;
      const maximumX = size.width * (current.zoom - 1) / 2;
      const maximumY = size.height * (current.zoom - 1) / 2;
      return {
        ...current,
        x: Math.max(-maximumX, Math.min(maximumX, current.x)),
        y: Math.max(-maximumY, Math.min(maximumY, current.y)),
      };
    });
  }, [size.height, size.width]);

  const handleEditorZoom = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!source) return;
    event.preventDefault();
    const area = areaRef.current;
    if (!area) return;
    const bounds = area.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left - bounds.width / 2;
    const cursorY = event.clientY - bounds.top - bounds.height / 2;
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
    const factor = Math.exp(-event.deltaY * deltaScale * .0017);
    setEditorViewport((current) => {
      const zoom = Math.max(1, Math.min(MAX_EDITOR_ZOOM, current.zoom * factor));
      if (zoom <= 1.001) return DEFAULT_EDITOR_VIEWPORT;
      const contentX = (cursorX - current.x) / current.zoom;
      const contentY = (cursorY - current.y) / current.zoom;
      const maximumX = size.width * (zoom - 1) / 2;
      const maximumY = size.height * (zoom - 1) / 2;
      return {
        zoom,
        x: Math.max(-maximumX, Math.min(maximumX, cursorX - contentX * zoom)),
        y: Math.max(-maximumY, Math.min(maximumY, cursorY - contentY * zoom)),
      };
    });
  }, [size.height, size.width, source]);

  const stopFreezeHold = useCallback(() => {
    holdingFreezeRef.current = false;
    if (freezeAnimationRef.current !== null) cancelAnimationFrame(freezeAnimationRef.current);
    freezeAnimationRef.current = null;
  }, []);

  const setCompletedForTimeline = useCallback((timelineTime: number) => {
    completedFreezesRef.current = new Set(freezes.filter((freeze) => freezeRange(freeze, freezes).end <= timelineTime + .001).map((freeze) => freeze.id));
  }, [freezes]);

  const beginFreezePlayback = useCallback((freeze: FreezeFrame, fromTimeline: number) => {
    const video = videoRef.current;
    if (!video) return;
    stopFreezeHold();
    const range = freezeRange(freeze, freezes);
    const startTime = Math.max(range.start, Math.min(range.end, fromTimeline));
    const startedAt = performance.now();
    holdingFreezeRef.current = true;
    video.currentTime = freeze.sourceTime;
    video.pause();
    setCurrentTime(startTime);
    setIsPlaying(true);

    const updateFreeze = (now: number) => {
      if (!holdingFreezeRef.current) return;
      const timelineTime = Math.min(range.end, startTime + (now - startedAt) / 1000 * speed);
      setCurrentTime(timelineTime);
      if (timelineTime >= range.end - .001) {
        holdingFreezeRef.current = false;
        freezeAnimationRef.current = null;
        completedFreezesRef.current.add(freeze.id);
        const resumeTime = Math.min(sourceDuration, freeze.sourceTime + .002);
        video.currentTime = resumeTime;
        lastSourceTimeRef.current = resumeTime;
        video.playbackRate = speed;
        void video.play().catch(() => setIsPlaying(false));
        return;
      }
      freezeAnimationRef.current = requestAnimationFrame(updateFreeze);
    };
    freezeAnimationRef.current = requestAnimationFrame(updateFreeze);
  }, [freezes, setCurrentTime, setIsPlaying, sourceDuration, speed, stopFreezeHold]);

  const publishSourceTime = useCallback((sourceTime: number) => {
    const video = videoRef.current;
    if (!video || holdingFreezeRef.current) return;
    if (effectiveClipEndSource && sourceTime >= effectiveClipEndSource - .008) {
      video.pause();
      video.currentTime = effectiveClipEndSource;
      setCurrentTime(clipEndTimeline);
      setIsPlaying(false);
      return;
    }
    const previousSourceTime = lastSourceTimeRef.current;
    const nextFreeze = freezes.find((freeze) => !completedFreezesRef.current.has(freeze.id)
      && freeze.sourceTime >= clipStart
      && freeze.sourceTime < effectiveClipEndSource
      && previousSourceTime <= freeze.sourceTime + .01
      && sourceTime >= freeze.sourceTime - .012);
    lastSourceTimeRef.current = sourceTime;
    if (nextFreeze && !video.paused) {
      beginFreezePlayback(nextFreeze, freezeRange(nextFreeze, freezes).start);
      return;
    }
    setCurrentTime(sourceTimeToTimeline(sourceTime, freezes));
  }, [beginFreezePlayback, clipEndTimeline, clipStart, effectiveClipEndSource, freezes, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    stopFreezeHold();
    completedFreezesRef.current.clear();
    video.pause();
    video.load();
    setSourceDuration(0);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setEditorViewport(DEFAULT_EDITOR_VIEWPORT);
  }, [source, setCurrentTime, setDuration, setIsPlaying, stopFreezeHold]);

  useEffect(() => {
    if (!sourceDuration) return;
    setDuration(getTimelineDuration(sourceDuration, freezes));
  }, [freezes, setDuration, sourceDuration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof video.requestVideoFrameCallback !== "function") return;
    let callbackId = 0;
    const publishFrameTime: VideoFrameRequestCallback = (_now, metadata) => {
      publishSourceTime(metadata.mediaTime);
      callbackId = video.requestVideoFrameCallback(publishFrameTime);
    };
    callbackId = video.requestVideoFrameCallback(publishFrameTime);
    return () => video.cancelVideoFrameCallback(callbackId);
  }, [publishSourceTime, source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || holdingFreezeRef.current) return;
    const point = timelineTimeToSource(currentTime, freezes);
    if (point.freeze) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - point.sourceTime) > .025) video.currentTime = point.sourceTime;
      lastSourceTimeRef.current = point.sourceTime;
      return;
    }
    if (Math.abs(video.currentTime - point.sourceTime) > .08) {
      setCompletedForTimeline(currentTime);
      video.currentTime = Math.max(0, Math.min(video.duration, point.sourceTime));
      lastSourceTimeRef.current = point.sourceTime;
    }
  }, [currentTime, freezes, setCompletedForTimeline]);

  useEffect(() => () => stopFreezeHold(), [stopFreezeHold]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.max(0, Math.min(duration || 0, time));
    const point = timelineTimeToSource(target, freezes);
    stopFreezeHold();
    setCompletedForTimeline(target);
    video.currentTime = Math.max(0, Math.min(video.duration || 0, point.sourceTime));
    lastSourceTimeRef.current = point.sourceTime;
    setCurrentTime(target);
    if (point.freeze) {
      video.pause();
      setIsPlaying(false);
    }
  }, [duration, freezes, setCompletedForTimeline, setCurrentTime, setIsPlaying, stopFreezeHold]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (isPlaying) {
      stopFreezeHold();
      video.pause();
      setIsPlaying(false);
      return;
    }
    let timelineTime = currentTimelineTimeRef.current;
    if (timelineTime < clipStartTimeline || timelineTime >= clipEndTimeline - .01) {
      timelineTime = clipStartTimeline;
      seek(timelineTime);
    }
    const point = timelineTimeToSource(timelineTime, freezes);
    setCompletedForTimeline(timelineTime);
    if (point.freeze) {
      beginFreezePlayback(point.freeze, timelineTime);
      return;
    }
    video.currentTime = point.sourceTime;
    lastSourceTimeRef.current = point.sourceTime;
    video.playbackRate = speed;
    void video.play().catch(() => setIsPlaying(false));
  }, [beginFreezePlayback, clipEndTimeline, clipStartTimeline, freezes, isPlaying, seek, setCompletedForTimeline, setIsPlaying, source, speed, stopFreezeHold]);

  const registerCapture = useCallback((capture: (() => HTMLCanvasElement | null) | null) => {
    drawingCaptureRef.current = capture;
  }, []);
  const getVideoElement = useCallback(() => videoRef.current, []);
  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    video.pause();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const drawingCanvas = drawingCaptureRef.current?.();
    if (drawingCanvas) context.drawImage(drawingCanvas, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  };
  useImperativeHandle(ref, () => ({
    toggle,
    seekBy: (seconds) => seek(currentTimelineTimeRef.current + seconds),
    frameBy: (frames) => seek(currentTimelineTimeRef.current + frames / 25),
    captureFrame,
  }));

  return (
    <div className="video-workspace" ref={fullscreenRef}>
      <div className={`video-area${editorViewport.zoom > 1.001 ? " editor-view-zoomed" : ""}`} ref={areaRef} onWheel={handleEditorZoom}>
        {source ? (
          <div
            className="video-frame"
            style={{
              width: size.width,
              height: size.height,
              transform: `translate3d(${editorViewport.x}px, ${editorViewport.y}px, 0) scale(${editorViewport.zoom})`,
              transformOrigin: "50% 50%",
            }}
          >
            <video
              ref={videoRef}
              src={source}
              crossOrigin="anonymous"
              playsInline
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                setAspect(video.videoWidth / video.videoHeight || 16 / 9);
                setSourceDuration(video.duration);
                setDuration(getTimelineDuration(video.duration, freezes));
                onDurationReady?.(video.duration);
                video.currentTime = Math.min(clipStart, video.duration);
                lastSourceTimeRef.current = video.currentTime;
                setCurrentTime(sourceTimeToTimeline(video.currentTime, freezes));
                video.volume = volume;
              }}
              onTimeUpdate={(event) => publishSourceTime(event.currentTarget.currentTime)}
              onSeeked={(event) => { if (!holdingFreezeRef.current) publishSourceTime(event.currentTarget.currentTime); }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => { if (!holdingFreezeRef.current) setIsPlaying(false); }}
              onEnded={() => setIsPlaying(false)}
              onError={(event) => {
                const video = event.currentTarget;
                const code = video.error?.code ?? 0;
                const codeName = ({ 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SOURCE_NOT_SUPPORTED" } as Record<number, string>)[code] || "UNKNOWN";
                let target = "origem desconhecida";
                try { target = new URL(video.currentSrc || source, window.location.href).origin; } catch { /* Keep safe fallback. */ }
                onPlaybackError?.(`Falha ao carregar o vídeo [GET ${target} · MEDIA_ERR_${codeName} (${code}) · readyState ${video.readyState} · networkState ${video.networkState} · aplicação ${window.location.origin}]`);
              }}
            />
            <div className="canvas-overlay"><DrawingCanvas width={size.width} height={size.height} registerCapture={registerCapture} getVideoElement={getVideoElement} /></div>
            {caption && <div className="video-caption slide-caption" style={{ top: `${captionPositionY * 100}%`, minHeight: `${captionHeight * 100}%`, backgroundColor: hexToRgba(captionBackgroundColor, captionOpacity), color: captionTextColor, fontSize: `${captionFontSize}px` }}>{caption}</div>}
          </div>
        ) : (
          <button className="empty-video" onClick={onChooseVideo}>
            <span className="empty-video-icon"><Film size={30} /></span>
            <strong>Carregar vídeo do jogo</strong>
            <span>MP4, WebM ou MOV compatível com o browser</span>
            <span className="upload-cta"><Upload size={15} /> Escolher ficheiro</span>
            <small>O vídeo fica sempre neste dispositivo</small>
          </button>
        )}
        {source && editorViewport.zoom > 1.001 && (
          <button
            type="button"
            className="editor-view-zoom-indicator"
            onClick={() => setEditorViewport(DEFAULT_EDITOR_VIEWPORT)}
            title="Repor a ampliação de edição"
          >
            ZOOM {Math.round(editorViewport.zoom * 100)}% <span>REPOR</span>
          </button>
        )}
      </div>
      <VideoControls
        playing={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        speed={speed}
        clipStart={clipStartTimeline}
        clipEnd={clipEndTimeline}
        disabled={!source}
        onToggle={toggle}
        onSeek={seek}
        onStep={(value) => seek(currentTimelineTimeRef.current + value)}
        onVolume={(value) => { setVolume(value); if (videoRef.current) videoRef.current.volume = value; }}
        onSpeed={(value) => { setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }}
        onFullscreen={() => fullscreenRef.current?.requestFullscreen()}
      />
    </div>
  );
});
