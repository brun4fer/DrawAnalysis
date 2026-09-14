"use client";

import type { LineupSlideContent } from "@/types/slide";
import { FootballPitch } from "../shared/FootballPitch";

interface Props { content: LineupSlideContent; interactive?: boolean; onChange?: (content: LineupSlideContent) => void }

export function LineupSlide({ content, interactive = true, onChange }: Props) {
  return (
    <div className="field-slide">
      <header><div><span>FORMAÇÃO</span><h2>{content.title}</h2><p>{content.subtitle || content.formation}</p></div><strong>{content.formation}</strong></header>
      <div className="field-slide-pitch">
        <FootballPitch
          players={content.players}
          homeColor={content.teamColor}
          interactive={interactive}
          onMove={(id, position) => onChange?.({ ...content, players: content.players.map((player) => player.id === id ? { ...player, position } : player) })}
        />
      </div>
    </div>
  );
}
