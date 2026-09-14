"use client";

import { AlignLeft, ClipboardType, Film, ImageIcon, LayoutTemplate, Presentation, ShieldHalf, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SlideType } from "@/types/slide";

interface Props { onSelect: (type: SlideType) => void; onClose: () => void }

const choices: Array<{ type: SlideType; label: string; description: string; icon: LucideIcon }> = [
  { type: "title", label: "Título / Secção", description: "Separador para um novo capítulo da análise", icon: LayoutTemplate },
  { type: "text", label: "Texto / Frase", description: "Conclusão, princípio ou mensagem-chave", icon: ClipboardType },
  { type: "lineup", label: "Escalação", description: "Onze inicial e formação editável", icon: ShieldHalf },
  { type: "video", label: "Vídeo / Jogada", description: "Vídeo local, desenhos, timeline e tracking", icon: Film },
  { type: "kickoff", label: "Pontapé de saída", description: "Sequência inicial num campo tático", icon: Presentation },
  { type: "tactical-board", label: "Quadro tático", description: "Campo livre para construir uma situação", icon: AlignLeft },
  { type: "image", label: "Imagem", description: "Fotografia ou frame externo para analisar", icon: ImageIcon },
];

export function SlideTypePicker({ onSelect, onClose }: Props) {
  return (
    <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="slide-type-picker" role="dialog" aria-modal="true" aria-labelledby="slide-picker-title">
        <header><div><span>NOVO SLIDE</span><h2 id="slide-picker-title">Que tipo de slide quer criar?</h2></div><button onClick={onClose}><X size={18} /></button></header>
        <div className="slide-type-grid">
          {choices.map(({ type, label, description, icon: Icon }) => (
            <button key={type} onClick={() => onSelect(type)}><i><Icon size={22} /></i><span><strong>{label}</strong><small>{description}</small></span></button>
          ))}
        </div>
      </section>
    </div>
  );
}
