"use client";

import { useRef, type CSSProperties } from "react";
import type { SlidePlayer } from "@/types/slide";

interface Props {
  players: SlidePlayer[];
  homeColor: string;
  goalkeeperColor?: string;
  awayColor?: string;
  homeTextColor?: string;
  awayTextColor?: string;
  pitchColor?: string;
  lineColor?: string;
  playerSize?: number;
  labelMode?: "number-name" | "name";
  ballPosition?: { x: number; y: number };
  showBall?: boolean;
  interactive?: boolean;
  onMove?: (playerId: string, position: { x: number; y: number }) => void;
  onSelectPlayer?: (playerId: string) => void;
  onMoveBall?: (position: { x: number; y: number }) => void;
}

export function FootballPitch({
  players,
  homeColor,
  goalkeeperColor,
  awayColor = "#ef5b67",
  homeTextColor = "#111111",
  awayTextColor = "#ffffff",
  pitchColor = "#23643b",
  lineColor = "#ffffff",
  playerSize = 1,
  labelMode = "number-name",
  ballPosition,
  showBall = false,
  interactive = true,
  onMove,
  onSelectPlayer,
  onMoveBall,
}: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: (position: { x: number; y: number }) => void) => {
    if (!interactive || !fieldRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const token = event.currentTarget;
    const bounds = fieldRef.current.getBoundingClientRect();
    const updateToken = (clientX: number, clientY: number) => {
      const x = Math.max(.03, Math.min(.97, (clientX - bounds.left) / bounds.width));
      const y = Math.max(.04, Math.min(.96, (clientY - bounds.top) / bounds.height));
      token.style.left = `${x * 100}%`;
      token.style.top = `${y * 100}%`;
      return { x, y };
    };
    const onMovePointer = (moveEvent: PointerEvent) => updateToken(moveEvent.clientX, moveEvent.clientY);
    const cleanup = () => {
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onUp = (upEvent: PointerEvent) => {
      commit(updateToken(upEvent.clientX, upEvent.clientY));
      cleanup();
    };
    const onCancel = () => cleanup();
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onCancel, { once: true });
  };

  const pitchStyle = {
    "--pitch-color": pitchColor,
    "--pitch-line-color": lineColor,
    "--pitch-player-size": playerSize,
  } as CSSProperties;

  return (
    <div className="football-pitch" ref={fieldRef} style={pitchStyle}>
      <div className="pitch-outline" />
      <div className="pitch-halfway" />
      <div className="pitch-circle" />
      <div className="pitch-spot" />
      <div className="penalty-area left"><i /></div>
      <div className="penalty-area right"><i /></div>
      {players.map((player) => (
        <button
          key={player.id}
          className={`pitch-player label-${labelMode} ${interactive ? "interactive" : ""}`}
          style={{
            left: `${player.position.x * 100}%`,
            top: `${player.position.y * 100}%`,
            background: player.buttonColor ?? (player.team === "home" ? (goalkeeperColor && (player.number === 1 || player.name.trim().toUpperCase() === "GR") ? goalkeeperColor : homeColor) : awayColor),
            color: player.textColor ?? (player.team === "home" ? homeTextColor : awayTextColor),
            "--individual-player-scale": player.size ?? 1,
          } as CSSProperties}
          onPointerDown={(event) => {
            onSelectPlayer?.(player.id);
            if (onMove) beginDrag(event, (position) => onMove(player.id, position));
          }}
          title={`${player.number} · ${player.name}`}
        >
          <strong>{labelMode === "name" ? (player.name || player.number) : player.number}</strong>
          {labelMode === "number-name" && <span>{player.name}</span>}
        </button>
      ))}
      {showBall && ballPosition && (
        <button
          type="button"
          className={`tactical-ball ${interactive && onMoveBall ? "interactive" : ""}`}
          style={{ left: `${ballPosition.x * 100}%`, top: `${ballPosition.y * 100}%` }}
          onPointerDown={(event) => { if (onMoveBall) beginDrag(event, onMoveBall); }}
          title="Bola"
          aria-label="Mover bola"
        >⚽</button>
      )}
    </div>
  );
}
