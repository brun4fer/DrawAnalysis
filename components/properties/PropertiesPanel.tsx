"use client";

import { Copy, LocateFixed, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { VideoSlideContent } from "@/types/slide";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

export function PropertiesPanel() {
  const { drawings, selectedId, updateDrawing, removeDrawing, duplicateDrawing, slides, selectedSlideId, updateSlide, currentTime, duration: videoDuration } = useEditorStore();
  const object = drawings.find((drawing) => drawing.id === selectedId);
  const activeSlide = slides.find((slide) => slide.id === selectedSlideId);

  if (!object) {
    return (
      <aside className="properties-panel">
        <div className="panel-title"><span>PROPRIEDADES</span></div>
        <div className="no-selection">
          <LocateFixed size={26} />
          <strong>Nenhum objeto selecionado</strong>
          <p>Selecione um desenho no vídeo ou na timeline para editar as propriedades.</p>
        </div>
        <div className="shortcut-card">
          <span>ATALHOS</span>
          <div><kbd>Space</kbd><em>Play / Pause</em></div>
          <div><kbd>← →</kbd><em>Navegar</em></div>
          <div><kbd>, .</kbd><em>Frame a frame</em></div>
          <div><kbd>Del</kbd><em>Eliminar objeto</em></div>
        </div>
        {activeSlide?.content.kind === "video" && <VideoSlidePresentationSettings slideId={activeSlide.id} content={activeSlide.content} slideDuration={activeSlide.duration} question={activeSlide.question} currentTime={currentTime} videoDuration={videoDuration} onUpdate={(patch) => updateSlide(activeSlide.id, patch)} />}
      </aside>
    );
  }

  const updateStyle = (patch: Partial<typeof object.style>) => updateDrawing(object.id, { style: { ...object.style, ...patch } });
  const updateTransform = (patch: Partial<typeof object.transform>) => updateDrawing(object.id, { transform: { ...object.transform, ...patch } });
  const applyEffectPreset = (preset: "clean" | "glow" | "shadow") => {
    if (preset === "clean") updateStyle({ shadowBlur: 0, shadowOpacity: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
    if (preset === "glow") updateStyle({ shadowColor: object.style.stroke, shadowBlur: 20, shadowOpacity: .9, shadowOffsetX: 0, shadowOffsetY: 0 });
    if (preset === "shadow") updateStyle({ shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .75, shadowOffsetX: 4, shadowOffsetY: 6 });
  };
  const duration = Math.max(0, object.endTime - object.startTime);
  const fillColor = object.style.fill.startsWith("#") ? object.style.fill.slice(0, 7) : "#a3ff12";
  const playerTrack = object.target?.kind === "player" && activeSlide?.content.kind === "video"
    ? activeSlide.content.playerTracks?.find((track) => track.id === object.target?.trackId)
    : undefined;

  return (
    <aside className="properties-panel">
      <div className="panel-title"><span>PROPRIEDADES</span><i>{object.type}</i></div>
      <div className="object-heading">
        <input value={object.name} onChange={(e) => updateDrawing(object.id, { name: e.target.value })} />
        <span>ID {object.id.slice(0, 6).toUpperCase()}</span>
      </div>

      <section className="property-section">
        <h3>APARÊNCIA</h3>
        <div className="effect-presets"><button onClick={() => applyEffectPreset("clean")}>Clean</button><button onClick={() => applyEffectPreset("glow")}>TV Glow</button><button onClick={() => applyEffectPreset("shadow")}>Sombra</button></div>
        <label className="field-row"><FieldLabel>Traço</FieldLabel><input type="color" value={object.style.stroke} onChange={(e) => updateStyle({ stroke: e.target.value })} /><code>{object.style.stroke}</code></label>
        {!["arrow", "line", "freeDraw", "text"].includes(object.type) && (
          <label className="field-row"><FieldLabel>Preench.</FieldLabel><input type="color" value={fillColor} onChange={(e) => updateStyle({ fill: `${e.target.value}33` })} /><code>{fillColor}</code></label>
        )}
        <label className="stacked-field"><span><FieldLabel>Espessura</FieldLabel><b>{object.style.strokeWidth}px</b></span><input type="range" min={1} max={16} value={object.style.strokeWidth} onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Opacidade</FieldLabel><b>{Math.round(object.style.opacity * 100)}%</b></span><input type="range" min={0.1} max={1} step={0.05} value={object.style.opacity} onChange={(e) => updateStyle({ opacity: Number(e.target.value) })} /></label>
        <label className="field-row"><FieldLabel>Efeito</FieldLabel><input type="color" value={object.style.shadowColor ?? "#000000"} onChange={(e) => updateStyle({ shadowColor: e.target.value })} /><code>{object.style.shadowColor ?? "#000000"}</code></label>
        <label className="stacked-field"><span><FieldLabel>Suavidade</FieldLabel><b>{object.style.shadowBlur ?? 0}px</b></span><input type="range" min={0} max={40} value={object.style.shadowBlur ?? 0} onChange={(e) => updateStyle({ shadowBlur: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Força efeito</FieldLabel><b>{Math.round((object.style.shadowOpacity ?? 0) * 100)}%</b></span><input type="range" min={0} max={1} step={.05} value={object.style.shadowOpacity ?? 0} onChange={(e) => updateStyle({ shadowOpacity: Number(e.target.value) })} /></label>
        <div className="two-fields shadow-offset-fields"><label><FieldLabel>Sombra X</FieldLabel><input type="number" min={-30} max={30} value={object.style.shadowOffsetX ?? 0} onChange={(e) => updateStyle({ shadowOffsetX: Number(e.target.value) })} /></label><label><FieldLabel>Sombra Y</FieldLabel><input type="number" min={-30} max={30} value={object.style.shadowOffsetY ?? 0} onChange={(e) => updateStyle({ shadowOffsetY: Number(e.target.value) })} /></label></div>
        {object.type !== "text" && <label className="toggle-row"><FieldLabel>Linha tracejada</FieldLabel><input type="checkbox" checked={object.style.dash.length > 0} onChange={(e) => updateStyle({ dash: e.target.checked ? [10, 7] : [] })} /><span /></label>}
        {object.data.kind === "text" && <TextContentField value={object.data.text} onChange={(text) => updateDrawing(object.id, { data: { kind: "text", origin: object.data.kind === "text" ? object.data.origin : { x: 0, y: 0 }, fontSize: object.data.kind === "text" ? object.data.fontSize : 0.055, text } })} />}
      </section>

      <section className="property-section">
        <h3>TEMPO</h3>
        <div className="two-fields">
          <label><FieldLabel>Início</FieldLabel><input type="number" min={0} step={0.04} value={object.startTime.toFixed(2)} onChange={(e) => updateDrawing(object.id, { startTime: Math.min(Number(e.target.value), object.endTime) })} /></label>
          <label><FieldLabel>Fim</FieldLabel><input type="number" min={0} step={0.04} value={object.endTime.toFixed(2)} onChange={(e) => updateDrawing(object.id, { endTime: Math.max(Number(e.target.value), object.startTime) })} /></label>
        </div>
        <div className="duration-readout"><span>Duração</span><strong>{duration.toFixed(2)} s</strong></div>
        <div className="two-fields animation-fields">
          <label><FieldLabel>Fade in</FieldLabel><input type="number" min={0} max={2} step={.1} value={object.animation?.fadeIn ?? 0} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, fadeIn: Number(event.target.value) } })} /></label>
          <label><FieldLabel>Fade out</FieldLabel><input type="number" min={0} max={2} step={.1} value={object.animation?.fadeOut ?? 0} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, fadeOut: Number(event.target.value) } })} /></label>
        </div>
        <label className="field-row"><FieldLabel>Animação</FieldLabel><select value={object.animation?.motion ?? "none"} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, motion: event.target.value as "none" | "scaleIn" | "pulse" } })}><option value="none">Fade</option><option value="scaleIn">Entrada pop</option><option value="pulse">Pulse</option></select></label>
        {object.animation?.motion === "pulse" && <><label className="stacked-field"><span><FieldLabel>Intensidade</FieldLabel><b>{Math.round((object.animation.pulseAmount ?? .05) * 100)}%</b></span><input type="range" min={.01} max={.2} step={.01} value={object.animation.pulseAmount ?? .05} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, pulseAmount: Number(event.target.value) } })} /></label><label className="stacked-field"><span><FieldLabel>Velocidade</FieldLabel><b>{(object.animation.pulseSpeed ?? 1.4).toFixed(1)}x</b></span><input type="range" min={.2} max={3} step={.1} value={object.animation.pulseSpeed ?? 1.4} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, pulseSpeed: Number(event.target.value) } })} /></label></>}
      </section>

      <section className="property-section">
        <h3>TRANSFORMAÇÃO</h3>
        <div className="two-fields">
          <label><FieldLabel>X</FieldLabel><input type="number" step={0.01} value={object.transform.x.toFixed(2)} onChange={(e) => updateTransform({ x: Number(e.target.value) })} /></label>
          <label><FieldLabel>Y</FieldLabel><input type="number" step={0.01} value={object.transform.y.toFixed(2)} onChange={(e) => updateTransform({ y: Number(e.target.value) })} /></label>
        </div>
        <label className="field-row numeric"><FieldLabel>Rotação</FieldLabel><input type="number" step={1} value={Math.round(object.transform.rotation)} onChange={(e) => updateTransform({ rotation: Number(e.target.value) })} /><code>°</code></label>
        <button className="secondary-button full" onClick={() => updateTransform({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })}>Repor transformação</button>
      </section>

      <section className="property-section tracking-section">
        <label className="toggle-row"><span><FieldLabel>Tracking</FieldLabel><small>{playerTrack ? `${playerTrack.name} · âncora nos pés` : "Sem jogador associado"}</small></span><input type="checkbox" checked={object.trackingEnabled} onChange={(e) => updateDrawing(object.id, { trackingEnabled: e.target.checked })} /><span /></label>
        <div className="keyframe-count">{playerTrack ? `${playerTrack.samples.length} deteção · confiança ${Math.round((playerTrack.samples[0]?.confidence ?? 0) * 100)}%` : `${object.keyframes.length} keyframes`}</div>
      </section>

      <div className="property-actions">
        <button className="secondary-button" onClick={() => duplicateDrawing(object.id)}><Copy size={15} /> Duplicar</button>
        <button className="danger-button" onClick={() => removeDrawing(object.id)}><Trash2 size={15} /> Eliminar</button>
      </div>
    </aside>
  );
}

function TextContentField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="text-field"><FieldLabel>Conteúdo</FieldLabel><textarea rows={2} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function VideoSlidePresentationSettings({ content, slideDuration, question, currentTime, videoDuration, onUpdate }: {
  slideId: string;
  content: VideoSlideContent;
  slideDuration: number;
  question: string;
  currentTime: number;
  videoDuration: number;
  onUpdate: (patch: { content?: VideoSlideContent; duration?: number; question?: string }) => void;
}) {
  const endTime = content.endTime ?? videoDuration;
  return (
    <section className="property-section video-presentation-settings">
      <h3>CORTE DO VÍDEO</h3>
      <div className="two-fields">
        <label><FieldLabel>Entrada</FieldLabel><input type="number" min={0} max={endTime} step={.04} value={content.startTime.toFixed(2)} onChange={(event) => onUpdate({ content: { ...content, startTime: Math.max(0, Math.min(Number(event.target.value), endTime - .08)) } })} /></label>
        <label><FieldLabel>Saída</FieldLabel><input type="number" min={content.startTime + .08} max={videoDuration} step={.04} value={endTime.toFixed(2)} onChange={(event) => onUpdate({ content: { ...content, endTime: Math.max(content.startTime + .08, Math.min(Number(event.target.value), videoDuration)) } })} /></label>
      </div>
      <div className="mark-controls"><button disabled={!videoDuration || currentTime >= endTime - .08} onClick={() => onUpdate({ content: { ...content, startTime: currentTime } })}>Marcar IN</button><button disabled={!videoDuration || currentTime <= content.startTime + .08} onClick={() => onUpdate({ content: { ...content, endTime: currentTime } })}>Marcar OUT</button></div>
      <div className="duration-readout"><span>Duração do corte</span><strong>{Math.max(0, endTime - content.startTime).toFixed(2)} s</strong></div>
      <label className="slide-prop-field"><span>Duração do slide</span><div><input type="number" min={1} max={60} step={.5} value={slideDuration} onChange={(event) => onUpdate({ duration: Math.max(1, Number(event.target.value)) })} /><i>s</i></div></label>
      <label className="slide-prop-field vertical"><span>Pergunta deste slide</span><textarea rows={3} placeholder="O que quer perguntar à equipa?" value={question} onChange={(event) => onUpdate({ question: event.target.value })} /></label>
    </section>
  );
}
