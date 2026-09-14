"use client";

import { Clock3, MessageSquareText } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";

export function StaticSlideFooter() {
  const { slides, selectedSlideId, updateSlide } = useEditorStore();
  const slide = slides.find((item) => item.id === selectedSlideId);
  if (!slide) return <section className="static-slide-footer" />;
  return (
    <section className="static-slide-footer">
      <div className="static-footer-title"><span>SLIDE SETTINGS</span><strong>{slide.name}</strong></div>
      <label><Clock3 size={15} /><span>Duração no preview</span><input type="number" min={1} max={60} step={.5} value={slide.duration} onChange={(event) => updateSlide(slide.id, { duration: Math.max(1, Number(event.target.value)) })} /><i>segundos</i></label>
      <label className="static-question"><MessageSquareText size={15} /><span>Pergunta</span><input placeholder="Pergunta para discussão neste slide" value={slide.question} onChange={(event) => updateSlide(slide.id, { question: event.target.value })} /></label>
      <div className="static-duration-track"><i style={{ width: `${Math.min(100, slide.duration / 10 * 100)}%` }} /></div>
    </section>
  );
}
