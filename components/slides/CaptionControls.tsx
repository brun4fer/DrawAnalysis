"use client";

import { Plus, Trash2 } from "lucide-react";
import type { AnalysisSlide } from "@/types/slide";
import { ColorPalettePicker } from "@/components/ui/ColorPalettePicker";
import { createId } from "@/utils/id";

type CaptionPatch = Pick<AnalysisSlide, "caption" | "captionOpacity" | "captionBackgroundColor" | "captionTextColor" | "captionSegments" | "captionFontSize" | "captionHeight" | "captionPositionY">;

export function CaptionControls({ slide, onChange }: { slide: CaptionPatch; onChange: (patch: Partial<CaptionPatch>) => void }) {
  const height = slide.captionHeight ?? .075;
  const segments = slide.captionSegments ?? [];
  const updateSegments = (captionSegments: NonNullable<AnalysisSlide["captionSegments"]>) => onChange({
    captionSegments: captionSegments.length ? captionSegments : undefined,
    caption: captionSegments.map((segment) => segment.text.trim()).filter(Boolean).join(" "),
  });
  return (
    <>
      {segments.length ? <>
        <div className="caption-segment-heading"><span>Textos da legenda</span><button type="button" onClick={() => onChange({ captionSegments: undefined })}>Usar texto simples</button></div>
        <div className="board-legend-segments">{segments.map((segment, index) => <div key={segment.id} className="board-legend-segment"><input value={segment.text} placeholder={`Texto ${index + 1}`} onChange={(event) => updateSegments(segments.map((item) => item.id === segment.id ? { ...item, text: event.target.value } : item))} /><ColorPalettePicker value={segment.color} onChange={(color) => updateSegments(segments.map((item) => item.id === segment.id ? { ...item, color } : item))} label={`Cor do texto ${index + 1}`} /><button type="button" className={segment.bold ? "active" : ""} onClick={() => updateSegments(segments.map((item) => item.id === segment.id ? { ...item, bold: !item.bold } : item))} title="Negrito"><b>B</b></button><button type="button" onClick={() => updateSegments(segments.filter((item) => item.id !== segment.id))} title="Remover texto"><Trash2 size={11} /></button></div>)}</div>
        <button type="button" className="report-add-property" onClick={() => updateSegments([...segments, { id: createId(), text: "NOVO TEXTO", color: slide.captionTextColor ?? "#101010", bold: false }])}><Plus size={12} /> Adicionar texto</button>
      </> : <>
        <label className="slide-prop-field vertical"><span>Legenda no ecrã</span><textarea rows={3} placeholder="Escreva a mensagem a apresentar..." value={slide.caption} onChange={(event) => onChange({ caption: event.target.value })} /></label>
        <button type="button" className="report-add-property" onClick={() => updateSegments([{ id: createId(), text: slide.caption || "TEXTO COLORIDO", color: slide.captionTextColor ?? "#101010", bold: true }, { id: createId(), text: "NOVO TEXTO", color: slide.captionTextColor ?? "#101010", bold: false }])}><Plus size={12} /> Usar várias cores</button>
      </>}
      <label className="stacked-field"><span><span className="field-label">Posição vertical</span><b>{Math.round((slide.captionPositionY ?? .9625) * 100)}%</b></span><input type="range" min={height / 2} max={1 - height / 2} step={.005} value={slide.captionPositionY ?? .9625} onChange={(event) => onChange({ captionPositionY: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Altura da barra</span><b>{Math.round(height * 100)}%</b></span><input type="range" min={.035} max={.2} step={.005} value={height} onChange={(event) => {
        const captionHeight = Number(event.target.value);
        const current = slide.captionPositionY ?? .9625;
        onChange({ captionHeight, captionPositionY: Math.max(captionHeight / 2, Math.min(1 - captionHeight / 2, current)) });
      }} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho do texto</span><b>{slide.captionFontSize ?? 22}px</b></span><input type="range" min={12} max={52} step={1} value={slide.captionFontSize ?? 22} onChange={(event) => onChange({ captionFontSize: Number(event.target.value) })} /></label>
      <div className="caption-color-field"><span>Fundo e opacidade</span><ColorPalettePicker value={slide.captionBackgroundColor ?? "#ffffff"} opacity={slide.captionOpacity ?? .74} onChange={(captionBackgroundColor) => onChange({ captionBackgroundColor })} onOpacityChange={(captionOpacity) => onChange({ captionOpacity })} label="Cor de fundo da legenda" /></div>
      <div className="caption-color-field"><span>Cor do texto</span><ColorPalettePicker value={slide.captionTextColor ?? "#101010"} onChange={(captionTextColor) => onChange({ captionTextColor })} label="Cor do texto da legenda" /></div>
    </>
  );
}
