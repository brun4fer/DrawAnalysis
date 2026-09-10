"use client";

import { Maximize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

interface Props {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  disabled: boolean;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onVolume: (volume: number) => void;
  onSpeed: (speed: number) => void;
  onStep: (seconds: number) => void;
  onFullscreen: () => void;
}

export function formatTime(value: number, precise = false) {
  if (!Number.isFinite(value)) return "00:00";
  const mins = Math.floor(value / 60).toString().padStart(2, "0");
  const secs = Math.floor(value % 60).toString().padStart(2, "0");
  return precise ? `${mins}:${secs}.${Math.floor(value % 1 * 100).toString().padStart(2, "0")}` : `${mins}:${secs}`;
}

export function VideoControls(props: Props) {
  return (
    <div className="video-controls">
      <button className="icon-button" onClick={() => props.onStep(-5)} disabled={props.disabled} title="Recuar 5 s"><SkipBack size={17} /></button>
      <button className="play-button" onClick={props.onToggle} disabled={props.disabled} title="Reproduzir / pausar">
        {props.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <button className="icon-button" onClick={() => props.onStep(5)} disabled={props.disabled} title="Avançar 5 s"><SkipForward size={17} /></button>
      <span className="timecode">{formatTime(props.currentTime, true)}</span>
      <input className="video-scrubber" aria-label="Posição do vídeo" type="range" min={0} max={props.duration || 0} step={0.01} value={props.currentTime} onChange={(e) => props.onSeek(Number(e.target.value))} disabled={props.disabled} />
      <span className="timecode muted">{formatTime(props.duration)}</span>
      <div className="volume-control">
        {props.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        <input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={props.volume} onChange={(e) => props.onVolume(Number(e.target.value))} />
      </div>
      <select className="speed-select" aria-label="Velocidade" value={props.speed} onChange={(e) => props.onSpeed(Number(e.target.value))}>
        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
      </select>
      <button className="icon-button" onClick={props.onFullscreen} disabled={props.disabled} title="Ecrã inteiro"><Maximize size={17} /></button>
    </div>
  );
}
