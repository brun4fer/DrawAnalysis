"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef } from "react";
import type { LineupSlideContent, SlidePlayer } from "@/types/slide";
import { SlideMediaBackground } from "../shared/SlideMediaBackground";
import { lineupBackgroundMedia } from "@/utils/slideMedia";
import { hexToRgba } from "@/utils/color";

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

function LeftFootIcon() {
  return (
    <svg className="left-foot-icon" viewBox="0 0 80 110" aria-hidden="true">
      <path d="M30 106C17 103 10 90 7 74 3 55 4 38 13 28c9-10 27-10 41-2 11 7 16 17 15 30-1 10-6 15-16 16-10 0-17 5-18 13-1 7 7 14 3 19-2 3-5 3-8 2Z" />
      <ellipse cx="8" cy="22" rx="7" ry="9" transform="rotate(-29 8 22)" />
      <ellipse cx="22" cy="12" rx="8" ry="10" transform="rotate(-14 22 12)" />
      <ellipse cx="38" cy="9" rx="8" ry="10" />
      <ellipse cx="55" cy="10" rx="9" ry="11" transform="rotate(10 55 10)" />
      <ellipse cx="71" cy="18" rx="8" ry="10" transform="rotate(22 71 18)" />
    </svg>
  );
}

export function LineupSlide({ content, interactive = true, onChange, playbackTime, playing }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const media = lineupBackgroundMedia(content);
  const template = content.template ?? "broadcast";
  const clubName = content.clubName?.trim() || "NOME DO CLUBE";
  const tacticalSystems = (content.tacticalSystems ?? []).filter((system) => system.trim());
  const leftFootMarker = content.leftFootMarker ?? "both";
  const background = content.background ?? "#0a0d0f";
  const panelOpacity = content.panelOpacity ?? .82;
  const playerNumberSize = content.playerNumberSize ?? 18;
  const playerNameSize = content.playerNameSize ?? 9;
  const playerPhotoScale = content.playerPhotoScale ?? 1;
  const playerCardScale = content.playerCardScale ?? 1;
  const panelScale = content.panelScale ?? 1;

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
    <article className={`probable-lineup-slide template-${template}`} data-slide-root style={{ "--team-color": content.teamColor, "--goalkeeper-color": content.goalkeeperColor, "--frame-color": content.frameColor ?? "#ffffff", "--pitch-color": content.pitchColor ?? "#07131a", "--player-number-size": `${playerNumberSize}px`, "--player-name-size": `${playerNameSize}px`, "--player-photo-scale": playerPhotoScale, "--player-card-scale": playerCardScale, "--mini-player-color": content.miniPlayerColor ?? "#92969a", "--mini-player-scale": content.miniPlayerScale ?? 1, "--lineup-label-size": `${content.lineupLabelFontSize ?? 7}px`, "--lineup-header-background": content.headerBackgroundColor ?? "#ffffff", "--lineup-header-text": content.headerTextColor ?? "#050505", "--left-foot-marker-color": content.leftFootMarkerColor ?? "#efff29" } as React.CSSProperties}>
      <SlideMediaBackground url={media.url} type={media.type} playbackTime={playbackTime} playing={playing} />
      <div className="slide-background-color" style={{ backgroundColor: background, opacity: content.backgroundOpacity ?? (media.url ? .3 : 1) }} />
      <div className="lineup-background-gradient" style={{ opacity: content.overlayOpacity ?? .62 }} />

      <div className="probable-lineup-panel" style={{ backgroundColor: hexToRgba(background, panelOpacity), transform: `scale(${panelScale})` }}>
        <header className="probable-lineup-header">
          <div className="probable-club-identity">
            <div className="probable-club-crest">
              {content.clubCrest ? <img src={content.clubCrest} alt={`Emblema ${clubName}`} /> : <span>{initials(clubName)}</span>}
            </div>
            {(content.title ?? "").trim() && <span>{content.title}</span>}
          </div>
          <h1>{clubName}</h1>
          <div className="probable-header-balance" aria-hidden="true" />
        </header>

        <div className="probable-lineup-body">
          <aside className="probable-lineup-sidebar" style={{ backgroundColor: hexToRgba(content.pitchColor, Math.min(1, panelOpacity + .08)) }}>
            {tacticalSystems.length > 0 && <div className="probable-formations">{tacticalSystems.map((system, index) => <strong key={`${system}-${index}`}>{system}</strong>)}</div>}
            <div className="probable-mini-pitch">
              <i className="mini-half" /><i className="mini-circle" /><i className="mini-box top" /><i className="mini-box bottom" />
              {content.players.map((player) => <span key={`mini-${player.id}`} style={{ left: `${player.position.y * 84 + 8}%`, top: `${player.position.x * 82 + 9}%` }} />)}
            </div>
            <div className="probable-coach-card">
              {content.coachPhoto && <div className="probable-coach-photo"><img src={content.coachPhoto} alt={content.coachName || "Treinador"} /></div>}
              <strong>{content.coachName || "Nome do treinador"}</strong>
              <small>TREINADOR</small>
              <em>HEAD-COACH</em>
            </div>
          </aside>

          <div className="probable-pitch" ref={pitchRef} style={{ backgroundColor: hexToRgba(content.pitchColor, panelOpacity) }}>
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
                    {player.preferredFoot === "left" && <em className={`preferred-foot-marker mode-${leftFootMarker}`} title="Pé esquerdo dominante">{leftFootMarker !== "foot" && <span>E</span>}{leftFootMarker !== "letter" && <LeftFootIcon />}</em>}
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
