"use client";

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Film, Upload } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { VideoControls } from "./VideoControls";

const DrawingCanvas = dynamic(() => import("@/components/canvas/DrawingCanvas").then((mod) => mod.DrawingCanvas), { ssr: false });

export interface VideoPlayerHandle {
  toggle: () => void;
  seekBy: (seconds: number) => void;
  frameBy: (frames: number) => void;
  captureFrame: () => string | null;
}

interface Props {
  source: string | null;
  clipStart?: number;
  clipEnd?: number;
  onChooseVideo: () => void;
  onDurationReady?: (duration: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer({ source, clipStart = 0, clipEnd, onChooseVideo, onDurationReady }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const drawingCaptureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const [size, setSize] = useState({ width: 960, height: 540 });
  const [aspect, setAspect] = useState(16 / 9);
  const [volume, setVolume] = useState(0.8);
  const [speed, setSpeed] = useState(1);
  const { currentTime, duration, isPlaying, setCurrentTime, setDuration, setIsPlaying } = useEditorStore();

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
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.load();
    setCurrentTime(0);
    setIsPlaying(false);
  }, [source, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && Math.abs(video.currentTime - currentTime) > 0.08) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, time));
    setCurrentTime(video.currentTime);
  };
  const toggle = () => {
    const video = videoRef.current;
    if (!video || !source) return;
    const effectiveEnd = Math.min(clipEnd ?? video.duration, video.duration);
    if (video.paused) {
      if (video.currentTime < clipStart || video.currentTime >= effectiveEnd - .02) {
        video.currentTime = clipStart;
        setCurrentTime(clipStart);
      }
      void video.play();
    } else video.pause();
  };
  const registerCapture = useCallback((capture: (() => HTMLCanvasElement | null) | null) => {
    drawingCaptureRef.current = capture;
  }, []);
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
    seekBy: (seconds) => seek((videoRef.current?.currentTime ?? 0) + seconds),
    frameBy: (frames) => seek((videoRef.current?.currentTime ?? 0) + frames / 25),
    captureFrame,
  }));

  return (
    <div className="video-workspace" ref={fullscreenRef}>
      <div className="video-area" ref={areaRef}>
        {source ? (
          <div className="video-frame" style={{ width: size.width, height: size.height }}>
            <video
              ref={videoRef}
              src={source}
              playsInline
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                setAspect(video.videoWidth / video.videoHeight || 16 / 9);
                setDuration(video.duration);
                onDurationReady?.(video.duration);
                video.currentTime = Math.min(clipStart, video.duration);
                setCurrentTime(video.currentTime);
                video.volume = volume;
              }}
              onTimeUpdate={(e) => {
                const video = e.currentTarget;
                const effectiveEnd = Math.min(clipEnd ?? video.duration, video.duration);
                if (!video.paused && video.currentTime >= effectiveEnd) {
                  video.pause();
                  video.currentTime = effectiveEnd;
                }
                setCurrentTime(video.currentTime);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="canvas-overlay"><DrawingCanvas width={size.width} height={size.height} registerCapture={registerCapture} /></div>
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
      </div>
      <VideoControls
        playing={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        speed={speed}
        clipStart={clipStart}
        clipEnd={Math.min(clipEnd ?? duration, duration)}
        disabled={!source}
        onToggle={toggle}
        onSeek={seek}
        onStep={(value) => seek(currentTime + value)}
        onVolume={(value) => { setVolume(value); if (videoRef.current) videoRef.current.volume = value; }}
        onSpeed={(value) => { setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }}
        onFullscreen={() => fullscreenRef.current?.requestFullscreen()}
      />
    </div>
  );
});
