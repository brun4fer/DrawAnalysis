"use client";

import { useRef } from "react";
import type { SlidePlayer } from "@/types/slide";

interface Props {
  players: SlidePlayer[];
  homeColor: string;
  awayColor?: string;
  interactive?: boolean;
  onMove?: (playerId: string, position: { x: number; y: number }) => void;
}

export function FootballPitch({ players, homeColor, awayColor = "#ef5b67", interactive = true, onMove }: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, playerId: string) => {
    if (!interactive || !onMove || !fieldRef.current) return;
    event.preventDefault();
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
    const onUp = (upEvent: PointerEvent) => {
      onMove(playerId, updateToken(upEvent.clientX, upEvent.clientY));
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMovePointer);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  return (
    <div className="football-pitch" ref={fieldRef}>
      <div className="pitch-outline" />
      <div className="pitch-halfway" />
      <div className="pitch-circle" />
      <div className="pitch-spot" />
      <div className="penalty-area left"><i /></div>
      <div className="penalty-area right"><i /></div>
      {players.map((player) => (
        <button
          key={player.id}
          className={`pitch-player ${interactive ? "interactive" : ""}`}
          style={{ left: `${player.position.x * 100}%`, top: `${player.position.y * 100}%`, background: player.team === "home" ? homeColor : awayColor }}
          onPointerDown={(event) => beginDrag(event, player.id)}
          title={`${player.number} · ${player.name}`}
        >
          <strong>{player.number}</strong>
          <span>{player.name}</span>
        </button>
      ))}
    </div>
  );
}
