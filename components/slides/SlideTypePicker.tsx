"use client";

import { AlignLeft, ClipboardList, ClipboardType, Film, ImageIcon, Landmark, LayoutTemplate, Presentation, ShieldHalf, UserRoundSearch, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SlideType } from "@/types/slide";
import { APP_PRODUCT, supportsPlayerProfile } from "@/lib/product";

interface Props { onSelect: (type: SlideType) => void; onClose: () => void }

const choices: Array<{ type: SlideType; label: string; description: string; icon: LucideIcon }> = [
  { type: "title", label: "Título / Momento", description: "Abertura de um momento com emblema e fundo audiovisual", icon: LayoutTemplate },
  { type: "text", label: "Conclusão", description: "Conclusão, princípio ou mensagem-chave", icon: ClipboardType },
  { type: "lineup", label: "Onze provável", description: "Clube, treinador e jogadores em formato broadcast", icon: ShieldHalf },
  { type: "team-overview", label: "Dados gerais da equipa", description: "Informações da equipa com fotografia do estádio", icon: Landmark },
  { type: "player-profile", label: "Player profile", description: "Perfil, posição no onze e estatísticas individuais", icon: UserRoundSearch },
  { type: "written-report", label: "Esquema tático + descrição", description: "Campo tático com título, subtítulo e texto lateral", icon: ClipboardList },
  { type: "video", label: "Vídeo / Jogada", description: "Vídeo local, desenhos, timeline e tracking", icon: Film },
  { type: "kickoff", label: "Apresentação de jogo", description: "Duelo entre clubes com emblemas, jornada e fundo audiovisual", icon: Presentation },
  { type: "tactical-board", label: "Quadro tático", description: "Campo livre para construir uma situação", icon: AlignLeft },
  { type: "image", label: "Imagem", description: "Fotografia ou frame externo para analisar", icon: ImageIcon },
];

export function SlideTypePicker({ onSelect, onClose }: Props) {
  const visibleChoices = supportsPlayerProfile(APP_PRODUCT.variant)
    ? choices
    : choices.filter((choice) => choice.type !== "player-profile");
  return (
    <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="slide-type-picker" role="dialog" aria-modal="true" aria-labelledby="slide-picker-title">
        <header><div><span>NOVO SLIDE</span><h2 id="slide-picker-title">Que tipo de slide quer criar?</h2></div><button onClick={onClose}><X size={18} /></button></header>
        <div className="slide-type-grid">
          {visibleChoices.map(({ type, label, description, icon: Icon }) => (
            <button key={type} onClick={() => onSelect(type)}><i><Icon size={22} /></i><span><strong>{label}</strong><small>{description}</small></span></button>
          ))}
        </div>
      </section>
    </div>
  );
}
