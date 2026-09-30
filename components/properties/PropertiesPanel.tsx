"use client";

import { Copy, LocateFixed, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { PlayerLabel, PlayerRingDesign } from "@/types/drawing";
import type { VideoSlideContent } from "@/types/slide";
import { getSourceDuration, sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

export function PropertiesPanel() {
  const { drawings, selectedId, updateDrawing, removeDrawing, duplicateDrawing, slides, selectedSlideId, updateSlide, setPlayerTrackStatus, currentTime, duration: videoDuration } = useEditorStore();
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
  const updatePlayerLabel = (patch: Partial<PlayerLabel>) => {
    if (object.data.kind !== "playerRing") return;
    const label: PlayerLabel = {
      visible: false,
      number: "",
      position: "",
      name: "JOGADOR",
      color: "#ffffff",
      fontSize: .032,
      ...object.data.label,
      ...patch,
    };
    updateDrawing(object.id, { data: { ...object.data, label } });
  };
  const updatePlayerLabelOffset = (labelOffsetY: number) => {
    if (object.data.kind !== "playerRing") return;
    updateDrawing(object.id, { data: { ...object.data, labelOffsetY: Math.max(.03, Math.min(.55, labelOffsetY)) } });
  };
  const updatePlayerRingAppearance = (patch: { ringDesign?: PlayerRingDesign; spinEnabled?: boolean; spinSpeed?: number }) => {
    if (object.data.kind !== "playerRing") return;
    updateDrawing(object.id, { data: { ...object.data, ...patch } });
  };
  const applyEffectPreset = (preset: "clean" | "glow" | "shadow") => {
    if (preset === "clean") updateStyle({ shadowBlur: 0, shadowOpacity: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
    if (preset === "glow") updateStyle({ shadowColor: object.style.stroke, shadowBlur: 20, shadowOpacity: .9, shadowOffsetX: 0, shadowOffsetY: 0 });
    if (preset === "shadow") updateStyle({ shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .75, shadowOffsetX: 4, shadowOffsetY: 6 });
  };
  const duration = Math.max(0, object.endTime - object.startTime);
  const fillColor = object.style.fill.startsWith("#") ? object.style.fill.slice(0, 7) : "#a3ff12";
  const isPlayerRing = object.type === "playerRing";
  const playerLabelOffset = object.data.kind === "playerRing" ? object.data.labelOffsetY ?? .12 : .12;
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
        {object.data.kind === "playerRing" && (
          <>
            <label className="field-row">
              <FieldLabel>Modelo</FieldLabel>
              <select value={object.data.ringDesign ?? "segmented"} onChange={(event) => updatePlayerRingAppearance({ ringDesign: event.target.value as PlayerRingDesign })}>
                <option value="segmented">Segmentado 3D</option>
                <option value="doubleLine">Duplo fino</option>
              </select>
            </label>
            <label className="toggle-row">
              <span><FieldLabel>Rotação oposta</FieldLabel><small>Os dois círculos giram entre si</small></span>
              <input type="checkbox" checked={object.data.spinEnabled !== false} onChange={(event) => updatePlayerRingAppearance({ spinEnabled: event.target.checked })} />
              <span />
            </label>
            {object.data.spinEnabled !== false && (
              <label className="stacked-field">
                <span><FieldLabel>Velocidade de rotação</FieldLabel><b>{(object.data.spinSpeed ?? 1).toFixed(1)}x</b></span>
                <input type="range" min={.2} max={2.5} step={.1} value={object.data.spinSpeed ?? 1} onChange={(event) => updatePlayerRingAppearance({ spinSpeed: Number(event.target.value) })} />
              </label>
            )}
          </>
        )}
        <div className="effect-presets"><button onClick={() => applyEffectPreset("clean")}>Clean</button><button onClick={() => applyEffectPreset("glow")}>TV Glow</button><button onClick={() => applyEffectPreset("shadow")}>Sombra</button></div>
        <label className="field-row"><FieldLabel>{isPlayerRing ? "Círculo exterior" : "Traço"}</FieldLabel><input type="color" value={object.style.stroke.slice(0, 7)} onChange={(e) => updateStyle({ stroke: e.target.value })} /><code>{object.style.stroke.slice(0, 7)}</code></label>
        {!["arrow", "line", "freeDraw", "text"].includes(object.type) && (
          <label className="field-row"><FieldLabel>{isPlayerRing ? "Círculo interior" : "Preench."}</FieldLabel><input type="color" value={fillColor} onChange={(e) => updateStyle({ fill: isPlayerRing ? e.target.value : `${e.target.value}33` })} /><code>{fillColor}</code></label>
        )}
        <label className="stacked-field"><span><FieldLabel>Espessura</FieldLabel><b>{object.style.strokeWidth}px</b></span><input type="range" min={1} max={16} value={object.style.strokeWidth} onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Opacidade</FieldLabel><b>{Math.round(object.style.opacity * 100)}%</b></span><input type="range" min={0.1} max={1} step={0.05} value={object.style.opacity} onChange={(e) => updateStyle({ opacity: Number(e.target.value) })} /></label>
        <label className="field-row"><FieldLabel>{isPlayerRing ? "Luz relvado" : "Efeito"}</FieldLabel><input type="color" value={(object.style.shadowColor ?? "#000000").slice(0, 7)} onChange={(e) => updateStyle({ shadowColor: e.target.value })} /><code>{(object.style.shadowColor ?? "#000000").slice(0, 7)}</code></label>
        <label className="stacked-field"><span><FieldLabel>Suavidade</FieldLabel><b>{object.style.shadowBlur ?? 0}px</b></span><input type="range" min={0} max={40} value={object.style.shadowBlur ?? 0} onChange={(e) => updateStyle({ shadowBlur: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Força efeito</FieldLabel><b>{Math.round((object.style.shadowOpacity ?? 0) * 100)}%</b></span><input type="range" min={0} max={1} step={.05} value={object.style.shadowOpacity ?? 0} onChange={(e) => updateStyle({ shadowOpacity: Number(e.target.value) })} /></label>
        <div className="two-fields shadow-offset-fields"><label><FieldLabel>Sombra X</FieldLabel><input type="number" min={-30} max={30} value={object.style.shadowOffsetX ?? 0} onChange={(e) => updateStyle({ shadowOffsetX: Number(e.target.value) })} /></label><label><FieldLabel>Sombra Y</FieldLabel><input type="number" min={-30} max={30} value={object.style.shadowOffsetY ?? 0} onChange={(e) => updateStyle({ shadowOffsetY: Number(e.target.value) })} /></label></div>
        {!isPlayerRing && object.type !== "text" && <label className="toggle-row"><FieldLabel>Linha tracejada</FieldLabel><input type="checkbox" checked={object.style.dash.length > 0} onChange={(e) => updateStyle({ dash: e.target.checked ? [10, 7] : [] })} /><span /></label>}
        {object.data.kind === "text" && <TextContentField value={object.data.text} onChange={(text) => updateDrawing(object.id, { data: { kind: "text", origin: object.data.kind === "text" ? object.data.origin : { x: 0, y: 0 }, fontSize: object.data.kind === "text" ? object.data.fontSize : 0.055, text } })} />}
      </section>

      {object.data.kind === "playerRing" && (
        <section className="property-section player-label-section">
          <h3>IDENTIFICAÇÃO DO JOGADOR</h3>
          <label className="toggle-row">
            <span><FieldLabel>Mostrar identificação</FieldLabel><small>Número / posição / nome</small></span>
            <input
              type="checkbox"
              checked={object.data.label?.visible ?? false}
              onChange={(event) => updatePlayerLabel({ visible: event.target.checked })}
            />
            <span />
          </label>
          {(object.data.label?.visible ?? false) && (
            <div className="player-label-fields">
              <div className="two-fields">
                <label>
                  <FieldLabel>Número</FieldLabel>
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="31"
                    value={object.data.label?.number ?? ""}
                    onChange={(event) => updatePlayerLabel({ number: event.target.value })}
                  />
                </label>
                <label>
                  <FieldLabel>Posição</FieldLabel>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="DC"
                    value={object.data.label?.position ?? ""}
                    onChange={(event) => updatePlayerLabel({ position: event.target.value })}
                  />
                </label>
              </div>
              <label className="player-label-name">
                <FieldLabel>Nome</FieldLabel>
                <input
                  type="text"
                  maxLength={24}
                  placeholder="SAMPAIO"
                  value={object.data.label?.name ?? ""}
                  onChange={(event) => updatePlayerLabel({ name: event.target.value })}
                />
              </label>
              <label className="field-row">
                <FieldLabel>Cor do texto</FieldLabel>
                <input
                  type="color"
                  value={(object.data.label?.color ?? "#ffffff").slice(0, 7)}
                  onChange={(event) => updatePlayerLabel({ color: event.target.value })}
                />
                <code>{(object.data.label?.color ?? "#ffffff").slice(0, 7)}</code>
              </label>
              <label className="stacked-field">
                <span><FieldLabel>Tamanho</FieldLabel><b>{Math.round((object.data.label?.fontSize ?? .032) * 540)} px</b></span>
                <input
                  type="range"
                  min={.018}
                  max={.06}
                  step={.002}
                  value={object.data.label?.fontSize ?? .032}
                  onChange={(event) => updatePlayerLabel({ fontSize: Number(event.target.value) })}
                />
              </label>
              <label className="stacked-field player-label-height">
                <span><FieldLabel>Posição vertical do texto</FieldLabel><b>{Math.round(playerLabelOffset * 100)}%</b></span>
                <input
                  type="range"
                  min={.03}
                  max={.55}
                  step={.005}
                  value={playerLabelOffset}
                  onChange={(event) => updatePlayerLabelOffset(Number(event.target.value))}
                />
              </label>
              <div className="player-label-position-buttons">
                <button type="button" onClick={() => updatePlayerLabelOffset(playerLabelOffset - .015)}>↓ Descer texto</button>
                <button type="button" onClick={() => updatePlayerLabelOffset(playerLabelOffset + .015)}>↑ Subir texto</button>
              </div>
            </div>
          )}
        </section>
      )}

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
        <label className="field-row"><FieldLabel>Animação</FieldLabel><select value={object.animation?.motion ?? "none"} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, motion: event.target.value as "none" | "scaleIn" | "ringLock" | "pulse" } })}><option value="none">Fade</option><option value="scaleIn">Entrada pop</option><option value="ringLock">Entrada 3D</option><option value="pulse">Pulse</option></select></label>
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
        <label className="toggle-row"><span><FieldLabel>Tracking</FieldLabel><small>{playerTrack ? `${playerTrack.name} · ${object.trackingEnabled ? "a seguir até parar" : playerTrack.status === "seeded" ? "opcional, atualmente desligado" : "tracking terminado"}` : "Sem jogador associado"}</small></span><input type="checkbox" checked={object.trackingEnabled} onChange={(e) => {
          const enabled = e.target.checked;
          updateDrawing(object.id, enabled
            ? { trackingEnabled: true, endTime: Math.max(object.endTime, videoDuration || currentTime + 3) }
            : { trackingEnabled: false, endTime: Math.max(object.startTime + .04, currentTime) });
          if (playerTrack) setPlayerTrackStatus(playerTrack.id, enabled ? "processing" : "ready");
        }} /><span /></label>
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
  const freezeFrames = content.freezeFrames ?? [];
  const sourceDuration = getSourceDuration(videoDuration, freezeFrames);
  const endTime = content.endTime ?? sourceDuration;
  const currentSourceTime = timelineTimeToSource(currentTime, freezeFrames).sourceTime;
  const presentationDuration = sourceTimeToTimeline(endTime, freezeFrames) - sourceTimeToTimeline(content.startTime, freezeFrames);
  return (
    <section className="property-section video-presentation-settings">
      <h3>CORTE DO VÍDEO</h3>
      <div className="two-fields">
        <label><FieldLabel>Entrada</FieldLabel><input type="number" min={0} max={endTime} step={.04} value={content.startTime.toFixed(2)} onChange={(event) => onUpdate({ content: { ...content, startTime: Math.max(0, Math.min(Number(event.target.value), endTime - .08)) } })} /></label>
        <label><FieldLabel>Saída</FieldLabel><input type="number" min={content.startTime + .08} max={sourceDuration} step={.04} value={endTime.toFixed(2)} onChange={(event) => onUpdate({ content: { ...content, endTime: Math.max(content.startTime + .08, Math.min(Number(event.target.value), sourceDuration)) } })} /></label>
      </div>
      <div className="mark-controls"><button disabled={!videoDuration || currentSourceTime >= endTime - .08} onClick={() => onUpdate({ content: { ...content, startTime: currentSourceTime } })}>Marcar IN</button><button disabled={!videoDuration || currentSourceTime <= content.startTime + .08} onClick={() => onUpdate({ content: { ...content, endTime: currentSourceTime } })}>Marcar OUT</button></div>
      <div className="duration-readout"><span>Duração com pausas</span><strong>{Math.max(0, presentationDuration).toFixed(2)} s</strong></div>
      <label className="slide-prop-field"><span>Duração do slide</span><div><input type="number" min={1} max={60} step={.5} value={slideDuration} onChange={(event) => onUpdate({ duration: Math.max(1, Number(event.target.value)) })} /><i>s</i></div></label>
      <label className="slide-prop-field vertical"><span>Pergunta deste slide</span><textarea rows={3} placeholder="O que quer perguntar à equipa?" value={question} onChange={(event) => onUpdate({ question: event.target.value })} /></label>
    </section>
  );
}
