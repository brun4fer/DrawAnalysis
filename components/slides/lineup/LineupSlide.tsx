"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import type { LineupSlideContent, SlidePlayer } from "@/types/slide";
import { SlideMediaBackground } from "../shared/SlideMediaBackground";
import { lineupBackgroundMedia } from "@/utils/slideMedia";

interface Props {
  content: LineupSlideContent;
  interactive?: boolean;
  onChange?: (content: LineupSlideContent) => void;
  playbackTime?: number;
  playing?: boolean;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "XI";
}

function PlayerPortrait({ player, color }: { player: SlidePlayer; color: string }) {
  if (player.photoUrl) return <img className="probable-player-photo" src={player.photoUrl} alt={player.name} />;
  return (
    <span className="probable-player-placeholder" style={{ "--player-color": color } as React.CSSProperties}>
      <i className="player-head" />
      <i className="player-shirt" />
    </span>
  );
}

export function LineupSlide({ content, interactive = true, onChange, playbackTime, playing }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const media = lineupBackgroundMedia(content);
  const template = content.template ?? "broadcast";
  const clubName = content.clubName || content.title || "NOME DO CLUBE";
  const background = content.background ?? "#0a0d0f";

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, playerId: string) => {
    if (!interactive || !onChange || !pitchRef.current) return;
    event.preventDefault();
    const token = event.currentTarget;
    const bounds = pitchRef.current.getBoundingClientRect();
    const update = (clientX: number, clientY: number) => {
      const x = Math.max(.035, Math.min(.96, (clientY - bounds.top) / bounds.height));
      const y = Math.max(.04, Math.min(.96, (clientX - bounds.left) / bounds.width));
      token.style.left = `${y * 100}%`;
      token.style.top = `${x * 100}%`;
      return { x, y };
    };
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY);
    const finish = (upEvent: PointerEvent) => {
      const position = update(upEvent.clientX, upEvent.clientY);
      onChange({ ...content, players: content.players.map((player) => player.id === playerId ? { ...player, position } : player) });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };

  return (
    <article className={`probable-lineup-slide template-${template}`} data-slide-root style={{ "--team-color": content.teamColor, "--goalkeeper-color": content.goalkeeperColor } as React.CSSProperties}>
      <SlideMediaBackground url={media.url} type={media.type} playbackTime={playbackTime} playing={playing} />
      <div className="slide-background-color" style={{ backgroundColor: background, opacity: content.backgroundOpacity ?? (media.url ? .3 : 1) }} />
      <div className="lineup-background-gradient" style={{ opacity: content.overlayOpacity ?? .62 }} />

      <div className="probable-lineup-panel">
        <header className="probable-lineup-header">
          <div className="probable-club">
            <div className="probable-club-crest">
              {content.clubCrest ? <img src={content.clubCrest} alt={`Emblema ${clubName}`} /> : <span>{initials(clubName)}</span>}
            </div>
            <div><span>{content.title || "ONZE PROVÁVEL"}</span><h1>{clubName}</h1></div>
          </div>
          <div className="probable-formation"><span>FORMAÇÃO</span><strong>{content.formation}</strong></div>
        </header>

        <div className="probable-lineup-body">
          <aside className="probable-coach-card">
            <div className="probable-coach-photo">
              {content.coachPhoto ? <img src={content.coachPhoto} alt={content.coachName || "Treinador"} /> : <span><i /><b /></span>}
            </div>
            <small>TREINADOR</small>
            <strong>{content.coachName || "Nome do treinador"}</strong>
          </aside>

          <div className="probable-pitch" ref={pitchRef}>
            <div className="probable-pitch-outline" />
            <div className="probable-pitch-half" />
            <div className="probable-pitch-circle" />
            <div className="probable-penalty top"><i /></div>
            <div className="probable-penalty bottom"><i /></div>
            {content.players.map((player) => {
              const isGoalkeeper = player.number === 1 || player.name.trim().toUpperCase() === "GR";
              const color = isGoalkeeper ? content.goalkeeperColor : content.teamColor;
              return (
                <button
                  type="button"
                  key={player.id}
                  className={`probable-player${interactive ? " interactive" : ""}`}
                  style={{ left: `${player.position.y * 100}%`, top: `${player.position.x * 100}%` }}
                  onPointerDown={(event) => beginDrag(event, player.id)}
                  title={`${player.number} · ${player.name}`}
                >
                  <span className="probable-player-card" style={{ "--card-color": color } as React.CSSProperties}>
                    <PlayerPortrait player={player} color={color} />
                    <b>{player.number}</b>
                  </span>
                  <strong>{player.name}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}
