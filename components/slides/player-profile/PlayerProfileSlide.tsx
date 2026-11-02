"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, type CSSProperties } from "react";
import { UserRound } from "lucide-react";
import type { PlayerProfileSlideContent } from "@/types/slide";
import { formationSlots } from "@/utils/slideFactory";

interface Props {
  content: PlayerProfileSlideContent;
  interactive?: boolean;
  onChange?: (content: PlayerProfileSlideContent) => void;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FC";
}

function display(value: string, suffix = "") {
  return value.trim() ? `${value.trim()}${suffix}` : "—";
}

export function PlayerProfileSlide({ content, interactive = true, onChange }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const slots = formationSlots(content.formation);
  const selectedSlot = Math.min(Math.max(0, content.selectedFormationSlot), slots.length - 1);
  const fullName = `${content.firstName} ${content.lastName}`.trim() || "PLAYER NAME";
  const shirtNumber = content.shirtNumber.trim() || "—";
  const statistics = [
    ["ACTUAL CLUB", content.clubName],
    ["POSITION", content.position],
    ["OTHER POSITION", content.otherPosition],
    ["STRONG FOOT", content.strongFoot],
    ["HEIGHT", display(content.heightCm, " CM")],
    ["WEIGHT", display(content.weightKg, " KG")],
    ["GAMES IN THE LEAGUE", content.leagueGames],
    ["TOTAL MINUTES", content.totalMinutes],
    ["YELLOW CARDS", content.yellowCards],
    ["GOALS", content.goals],
    ["ASSISTS", content.assists],
  ] as const;

  const selectSlot = (index: number) => {
    if (!interactive || !onChange) return;
    onChange({
      ...content,
      selectedFormationSlot: index,
      playerPosition: { ...slots[index].position },
    });
  };

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive || !onChange || !pitchRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const marker = event.currentTarget;
    const bounds = pitchRef.current.getBoundingClientRect();
    const update = (clientX: number, clientY: number) => {
      const position = {
        x: Math.max(.04, Math.min(.96, (clientY - bounds.top) / bounds.height)),
        y: Math.max(.05, Math.min(.95, (clientX - bounds.left) / bounds.width)),
      };
      marker.style.left = `${position.y * 100}%`;
      marker.style.top = `${position.x * 100}%`;
      return position;
    };
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY);
    const finish = (upEvent: PointerEvent) => {
      onChange({ ...content, playerPosition: update(upEvent.clientX, upEvent.clientY) });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };

  const style = {
    "--profile-accent": content.accentColor ?? "#8d111c",
    "--profile-panel": content.panelColor ?? "#24080b",
    "--profile-pitch": content.pitchColor ?? "#111416",
    "--profile-pitch-line": content.pitchLineColor ?? "#f5f2ed",
  } as CSSProperties;

  return (
    <article className="player-profile-slide" data-slide-root style={style}>
      <section className="player-profile-identity">
        <div className="player-profile-photo-card">
          <span className="player-profile-number">{shirtNumber}</span>
          {content.playerPhoto
            ? <img className="player-profile-photo" src={content.playerPhoto} alt={fullName} />
            : <div className="player-profile-photo-placeholder"><UserRound size={122} strokeWidth={1.2} /><span>PLAYER PHOTO</span></div>}
          <div className="player-profile-club-crest">
            {content.clubCrest ? <img src={content.clubCrest} alt={`${content.clubName || "Club"} crest`} /> : <span>{initials(content.clubName)}</span>}
          </div>
        </div>
        <div className="player-profile-name-block">
          <div><h1>{fullName}</h1><strong>{content.position || "POSITION"}</strong></div>
          <p>{content.clubName || "CURRENT CLUB"}</p>
        </div>
      </section>

      <section className="player-profile-formation">
        <header><span>POSITION MAP</span><strong>{content.formation}</strong></header>
        <div className="player-profile-pitch" ref={pitchRef}>
          <div className="player-profile-pitch-outline" />
          <div className="player-profile-pitch-halfway" />
          <div className="player-profile-pitch-circle" />
          <div className="player-profile-pitch-box top"><i /></div>
          <div className="player-profile-pitch-box bottom"><i /></div>
          {slots.map((slot, index) => (
            <button
              type="button"
              key={`${content.formation}-${slot.label}-${index}`}
              className={`player-profile-slot${index === selectedSlot ? " selected" : ""}`}
              style={{ left: `${slot.position.y * 100}%`, top: `${slot.position.x * 100}%` }}
              onClick={() => selectSlot(index)}
              disabled={!interactive}
              aria-label={`Select ${slot.label}`}
            ><span>{slot.label}</span></button>
          ))}
          <button
            type="button"
            className={`player-profile-marker${interactive ? " interactive" : ""}`}
            style={{ left: `${content.playerPosition.y * 100}%`, top: `${content.playerPosition.x * 100}%` }}
            onPointerDown={beginDrag}
            disabled={!interactive}
            aria-label={`Move ${fullName}`}
          ><strong>{shirtNumber}</strong><span>{content.position || slots[selectedSlot]?.label}</span></button>
        </div>
        <footer><span>SELECT A POSITION OR DRAG THE PLAYER</span><strong>{slots[selectedSlot]?.label}</strong></footer>
      </section>

      <section className="player-profile-statistics">
        <header><span>PLAYER</span><strong>INFORMATION</strong></header>
        <dl>
          {statistics.map(([label, rawValue]) => (
            <div key={label}><dt>{label}</dt><dd>{rawValue?.trim() || "—"}</dd></div>
          ))}
        </dl>
      </section>
    </article>
  );
}
