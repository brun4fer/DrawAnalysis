"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, X } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";

interface Props { onClose: () => void }

export function PresentationMode({ onClose }: Props) {
  const { slides, selectedSlideId } = useEditorStore();
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.id === selectedSlideId));
  const [index, setIndex] = useState(initialIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const slide = slides[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight" || event.code === "Space") {
        event.preventDefault();
        setIndex((value) => Math.min(slides.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slides.length]);

  if (!slide) return null;

  return (
    <div className="presentation-mode" ref={rootRef}>
      <header>
        <div><span>{String(index + 1).padStart(2, "0")}</span><strong>{slide.title}</strong></div>
        <div className="presentation-actions">
          <button onClick={() => rootRef.current?.requestFullscreen()} title="Ecrã inteiro"><Maximize size={18} /></button>
          <button onClick={onClose} title="Fechar apresentação"><X size={20} /></button>
        </div>
      </header>
      <div className="presentation-content">
        <div className="presentation-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.imageDataUrl} alt={slide.title} />
        </div>
        <div className={`presentation-question ${slide.question ? "" : "empty"}`}>
          <span>PERGUNTA</span>
          <p>{slide.question || "Sem pergunta definida para este slide."}</p>
        </div>
      </div>
      <footer>
        <button onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}><ChevronLeft size={24} /></button>
        <div className="presentation-progress">{slides.map((item, itemIndex) => <i key={item.id} className={itemIndex === index ? "active" : ""} />)}</div>
        <button onClick={() => setIndex((value) => Math.min(slides.length - 1, value + 1))} disabled={index === slides.length - 1}><ChevronRight size={24} /></button>
      </footer>
    </div>
  );
}
