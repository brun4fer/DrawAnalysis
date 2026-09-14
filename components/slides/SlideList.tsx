"use client";

import { Copy, Film, GripVertical, ImageIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import type { AnalysisSlide } from "@/types/slide";

interface Props { onAdd: () => void }

const typeLabels: Record<AnalysisSlide["type"], string> = {
  title: "TITLE", text: "TEXT", lineup: "LINEUP", video: "VIDEO", kickoff: "KICKOFF", "tactical-board": "TACTICAL", image: "IMAGE",
};

export function SlideList({ onAdd }: Props) {
  const { slides, selectedSlideId, setSelectedSlideId, removeSlide, duplicateSlide, reorderSlide } = useEditorStore();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  return (
    <aside className="slide-list-panel">
      <header><div><span>SLIDES</span><i>{slides.length}</i></div><button onClick={onAdd} title="Adicionar slide"><Plus size={17} /></button></header>
      <div className="slide-list-scroll">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`slide-list-item ${selectedSlideId === slide.id ? "selected" : ""}`}
            draggable
            onDragStart={() => setDraggedId(slide.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => { if (draggedId) reorderSlide(draggedId, slide.id); setDraggedId(null); }}
          >
            <button className="slide-select" onClick={() => setSelectedSlideId(slide.id)}>
              <span className="slide-index">{String(index + 1).padStart(2, "0")}</span>
              <SlideMiniature slide={slide} />
              <span className="slide-list-copy"><i>{typeLabels[slide.type]}</i><strong>{slide.name}</strong></span>
            </button>
            <GripVertical className="slide-grip" size={14} />
            <div className="slide-item-actions"><button onClick={() => duplicateSlide(slide.id)} title="Duplicar"><Copy size={12} /></button><button onClick={() => removeSlide(slide.id)} title="Eliminar"><Trash2 size={12} /></button></div>
          </div>
        ))}
        {!slides.length && <div className="slide-list-empty">Ainda não existem slides.</div>}
      </div>
      <button className="add-slide-large" onClick={onAdd}><Plus size={15} /> Add Slide</button>
    </aside>
  );
}

function SlideMiniature({ slide }: { slide: AnalysisSlide }) {
  const content = slide.content;
  if (content.kind === "image" && content.imageDataUrl) return <span className="slide-mini image" style={{ backgroundImage: `url(${content.imageDataUrl})` }} />;
  if (content.kind === "video") return <span className="slide-mini video" style={content.thumbnail ? { backgroundImage: `url(${content.thumbnail})` } : undefined}><Film size={14} /></span>;
  if (content.kind === "lineup" || content.kind === "kickoff" || content.kind === "tactical-board") return <span className="slide-mini field"><i /><b /><em /></span>;
  if (content.kind === "title") return <span className="slide-mini title" style={{ background: content.background }}><b>{content.text.slice(0, 2)}</b></span>;
  if (content.kind === "text") return <span className="slide-mini text" style={{ background: content.background }}><i /><i /><i /></span>;
  return <span className="slide-mini"><ImageIcon size={14} /></span>;
}
