"use client";

import dynamic from "next/dynamic";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Film, Upload } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { VideoControls } from "./VideoControls";

const DrawingCanvas = dynamic(() => import("@/components/canvas/DrawingCanvas").then((mod) => mod.DrawingCanvas), { ssr: false });

export interface VideoPlayerHandle {
  toggle: () => void;
  seekBy: (seconds: number) => void;
  frameBy: (frames: number) => void;
}

interface Props { source: string | null; onChooseVideo: () => void }

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer({ source, onChooseVideo }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
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
    if (video.paused) void video.play(); else video.pause();
  };
  useImperativeHandle(ref, () => ({ toggle, seekBy: (seconds) => seek((videoRef.current?.currentTime ?? 0) + seconds), frameBy: (frames) => seek((videoRef.current?.currentTime ?? 0) + frames / 25) }));

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
                video.volume = volume;
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="canvas-overlay"><DrawingCanvas width={size.width} height={size.height} /></div>
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
