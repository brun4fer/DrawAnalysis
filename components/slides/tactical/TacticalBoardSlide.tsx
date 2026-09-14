"use client";

import type { BoardSlideContent } from "@/types/slide";
import { FootballPitch } from "../shared/FootballPitch";

interface Props { content: BoardSlideContent; interactive?: boolean; onChange?: (content: BoardSlideContent) => void }

export function TacticalBoardSlide({ content, interactive = true, onChange }: Props) {
  return (
    <div className="field-slide tactical-slide">
      <header><div><span>QUADRO TÁTICO</span><h2>{content.title}</h2><p>Arraste os jogadores para construir a situação</p></div><strong>BOARD</strong></header>
      <div className="field-slide-pitch">
        <FootballPitch players={content.players} homeColor={content.homeColor} awayColor={content.awayColor} interactive={interactive} onMove={(id, position) => onChange?.({ ...content, players: content.players.map((player) => player.id === id ? { ...player, position } : player) })} />
      </div>
    </div>
  );
}
