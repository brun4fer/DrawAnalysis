"use client";

import type { BoardSlideContent } from "@/types/slide";
import { FootballPitch } from "../shared/FootballPitch";

interface Props { content: BoardSlideContent; interactive?: boolean; onChange?: (content: BoardSlideContent) => void }

export function KickoffSlide({ content, interactive = true, onChange }: Props) {
  return (
    <div className="field-slide kickoff-slide">
      <header><div><span>SEQUÊNCIA INICIAL</span><h2>{content.title}</h2><p>Posicione os jogadores para explicar o movimento</p></div><strong>KO</strong></header>
      <div className="field-slide-pitch">
        <FootballPitch players={content.players} homeColor={content.homeColor} awayColor={content.awayColor} interactive={interactive} onMove={(id, position) => onChange?.({ ...content, players: content.players.map((player) => player.id === id ? { ...player, position } : player) })} />
        <div className="kickoff-ball">●</div>
      </div>
    </div>
  );
}
