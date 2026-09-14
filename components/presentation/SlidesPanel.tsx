"use client";

import { ArrowLeft, ArrowRight, Play, Presentation, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { formatTime } from "@/components/video/VideoControls";

interface Props { onPresent: () => void }

export function SlidesPanel({ onPresent }: Props) {
  const { slides, selectedSlideId, setSelectedSlideId, updateSlide, removeSlide, moveSlide } = useEditorStore();
  const selected = slides.find((slide) => slide.id === selectedSlideId) ?? slides[0];
  const selectedIndex = selected ? slides.findIndex((slide) => slide.id === selected.id) : -1;

  return (
    <section className="slides-panel">
      <div className="slides-toolbar">
        <div className="timeline-title"><Presentation size={15} /> APRESENTAÇÃO <span>{slides.length} slides</span></div>
        <button className="present-button" onClick={onPresent} disabled={!slides.length}><Play size={14} fill="currentColor" /> Apresentar</button>
      </div>
      {!slides.length ? (
        <div className="slides-empty">
          <Presentation size={26} />
          <div><strong>A apresentação começa aqui</strong><span>Pare o vídeo, faça os desenhos e carregue em “Criar slide”.</span></div>
        </div>
      ) : (
        <div className="slides-body">
          <div className="slide-strip">
            {slides.map((slide, index) => (
              <button key={slide.id} className={`slide-card ${selected?.id === slide.id ? "selected" : ""}`} onClick={() => setSelectedSlideId(slide.id)}>
                <span className="slide-number">{index + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slide.imageDataUrl} alt={slide.title} />
                <span className="slide-card-meta"><strong>{slide.title}</strong><i>{formatTime(slide.videoTime, true)}</i></span>
                {slide.question && <span className="question-indicator">?</span>}
              </button>
            ))}
          </div>
          {selected && (
            <aside className="slide-editor">
              <div className="slide-editor-heading"><span>SLIDE {selectedIndex + 1}</span><button onClick={() => removeSlide(selected.id)} title="Eliminar slide"><Trash2 size={14} /></button></div>
              <label><span>Título</span><input value={selected.title} onChange={(event) => updateSlide(selected.id, { title: event.target.value })} /></label>
              <label className="question-field"><span>Pergunta para este slide</span><textarea rows={2} placeholder="Ex.: Onde está o espaço livre nesta situação?" value={selected.question} onChange={(event) => updateSlide(selected.id, { question: event.target.value })} /></label>
              <div className="slide-order">
                <button onClick={() => moveSlide(selected.id, -1)} disabled={selectedIndex <= 0}><ArrowLeft size={13} /> Anterior</button>
                <button onClick={() => moveSlide(selected.id, 1)} disabled={selectedIndex >= slides.length - 1}>Seguinte <ArrowRight size={13} /></button>
              </div>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
