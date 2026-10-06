"use client";

import { Copy, LocateFixed, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { ActionLabel, LineDesign, PlayerLabel, PlayerRingDesign, TextDesign, ZoneDesign } from "@/types/drawing";
import type { VideoSlideContent } from "@/types/slide";
import { getSourceDuration, sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

function fillOpacityOf(color: string) {
  const alpha = color.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/i)?.[1];
  return alpha ? Number.parseInt(alpha, 16) / 255 : 1;
}

function withFillOpacity(color: string, opacity: number) {
  const base = color.match(/^#[0-9a-f]{6}/i)?.[0] ?? "#a3ff12";
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0");
  return `${base}${alpha}`;
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
        {activeSlide?.content.kind === "video" && <VideoSlidePresentationSettings slideId={activeSlide.id} content={activeSlide.content} slideDuration={activeSlide.duration} caption={activeSlide.caption} currentTime={currentTime} videoDuration={videoDuration} onUpdate={(patch) => updateSlide(activeSlide.id, patch)} />}
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
  const updatePlayerRingAppearance = (patch: { ringDesign?: PlayerRingDesign; spinEnabled?: boolean; spinSpeed?: number; showRing?: boolean; splashEnabled?: boolean; splashSpeed?: number }) => {
    if (object.data.kind !== "playerRing") return;
    updateDrawing(object.id, { data: { ...object.data, ...patch } });
  };
  const updateLineAppearance = (patch: { lineDesign?: LineDesign; secondaryColor?: string }) => {
    if (object.data.kind !== "line") return;
    updateDrawing(object.id, { data: { ...object.data, ...patch } });
  };
  const updatePatternAppearance = (patch: { design?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number }) => {
    if (object.data.kind === "polygon") {
      const { design, ...stripePatch } = patch;
      updateDrawing(object.id, { data: { ...object.data, ...stripePatch, ...(design ? { zoneDesign: design } : {}) } });
      return;
    }
    if (object.data.kind === "triangle" || object.data.kind === "rectangle") {
      const { design, ...stripePatch } = patch;
      updateDrawing(object.id, { data: { ...object.data, ...stripePatch, ...(design ? { fillDesign: design } : {}) } });
    }
  };
  const updateTextAppearance = (patch: { textDesign?: TextDesign; groundTilt?: number; groundDepth?: number }) => {
    if (object.data.kind !== "text") return;
    updateDrawing(object.id, { data: { ...object.data, ...patch } });
  };
  const updateActionLabel = (patch: Partial<ActionLabel>) => {
    const actionIndex = drawings.filter((drawing) => ["line", "arrow", "longBallArrow"].includes(drawing.type)).findIndex((drawing) => drawing.id === object.id) + 1;
    const actionLabel: ActionLabel = {
      visible: false,
      value: String(Math.max(1, actionIndex)),
      position: .5,
      color: "#ffffff",
      backgroundColor: "#174ea6",
      fontSize: .022,
      ...object.actionLabel,
      ...patch,
    };
    updateDrawing(object.id, { actionLabel });
  };
  const updateGlimpseLength = (length: number) => {
    if (object.data.kind !== "glimpse") return;
    const deltaX = object.data.target.x - object.data.origin.x;
    const deltaY = object.data.target.y - object.data.origin.y;
    const currentLength = Math.max(.001, Math.hypot(deltaX, deltaY));
    updateDrawing(object.id, { data: { ...object.data, target: { x: object.data.origin.x + deltaX / currentLength * length, y: object.data.origin.y + deltaY / currentLength * length } } });
  };
  const applyEffectPreset = (preset: "clean" | "glow" | "shadow") => {
    if (preset === "clean") updateStyle({ shadowBlur: 0, shadowOpacity: 0, shadowOffsetX: 0, shadowOffsetY: 0 });
    if (preset === "glow") updateStyle({ shadowColor: object.style.stroke, shadowBlur: 20, shadowOpacity: .9, shadowOffsetX: 0, shadowOffsetY: 0 });
    if (preset === "shadow") updateStyle({ shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .75, shadowOffsetX: 4, shadowOffsetY: 6 });
  };
  const duration = Math.max(0, object.endTime - object.startTime);
  const fillColor = object.style.fill.startsWith("#") ? object.style.fill.slice(0, 7) : "#a3ff12";
  const fillOpacity = fillOpacityOf(object.style.fill);
  const isPlayerRing = object.type === "playerRing";
  const hasFixedBlackShadow = object.type === "arrow" || object.type === "longBallArrow";
  const supportsFill = !["arrow", "longBallArrow", "line", "freeDraw", "text", "playerRing", "ghost", "identifyPlayer", "zoom", "glimpse", "spotlight"].includes(object.type);
  const supportsActionLabel = ["line", "arrow", "longBallArrow"].includes(object.type);
  const glimpseLength = object.data.kind === "glimpse" ? Math.hypot(object.data.target.x - object.data.origin.x, object.data.target.y - object.data.origin.y) : .2;
  const playerLabelOffset = object.data.kind === "playerRing" ? object.data.labelOffsetY ?? .12 : .12;
  const patternData = object.data.kind === "polygon" || object.data.kind === "triangle" || object.data.kind === "rectangle" ? object.data : null;
  const supportsPatternFill = patternData !== null;
  const patternDesign = object.data.kind === "polygon"
    ? object.data.zoneDesign ?? "solid"
    : object.data.kind === "triangle" || object.data.kind === "rectangle"
      ? object.data.fillDesign ?? "solid"
      : "solid";
  const stripeColor = patternData?.stripeColor ?? "#ffffff";
  const stripeAngle = patternData?.stripeAngle ?? 58;
  const stripeSpacing = patternData?.stripeSpacing ?? .014;
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
            <label className="toggle-row">
              <span><FieldLabel>Mostrar anel</FieldLabel><small>O tracking continua mesmo sem o anel</small></span>
              <input type="checkbox" checked={object.data.showRing !== false} onChange={(event) => updatePlayerRingAppearance({ showRing: event.target.checked })} />
              <span />
            </label>
            <label className="field-row">
              <FieldLabel>Modelo</FieldLabel>
              <select value={object.data.ringDesign ?? "segmented"} onChange={(event) => updatePlayerRingAppearance({ ringDesign: event.target.value as PlayerRingDesign })}>
                <option value="segmented">Segmentado 3D</option>
                <option value="doubleLine">Duplo fino</option>
                <option value="broadcast">Broadcast 3D</option>
                <option value="broadcastGlow">Broadcast · halo branco</option>
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
            <label className="toggle-row">
              <span><FieldLabel>Efeito Splash</FieldLabel><small>Ondas pequenas que crescem e desaparecem</small></span>
              <input type="checkbox" checked={object.data.splashEnabled ?? false} onChange={(event) => updatePlayerRingAppearance({ splashEnabled: event.target.checked })} />
              <span />
            </label>
            {object.data.splashEnabled && (
              <label className="stacked-field">
                <span><FieldLabel>Velocidade do Splash</FieldLabel><b>{(object.data.splashSpeed ?? 1).toFixed(1)}x</b></span>
                <input type="range" min={.35} max={2.5} step={.05} value={object.data.splashSpeed ?? 1} onChange={(event) => updatePlayerRingAppearance({ splashSpeed: Number(event.target.value) })} />
              </label>
            )}
          </>
        )}
        {supportsPatternFill && (
          <>
            <label className="field-row">
              <FieldLabel>{object.data.kind === "polygon" ? "Modelo da zona" : "Modelo do preenchimento"}</FieldLabel>
              <select value={patternDesign} onChange={(event) => updatePatternAppearance({ design: event.target.value as ZoneDesign })}>
                <option value="solid">Preenchimento</option>
                <option value="striped">Riscas de espaço</option>
              </select>
            </label>
            {patternDesign === "striped" && (
              <>
                <label className="field-row"><FieldLabel>Cor das riscas</FieldLabel><input type="color" value={stripeColor.slice(0, 7)} onChange={(event) => updatePatternAppearance({ stripeColor: event.target.value })} /><code>{stripeColor.slice(0, 7)}</code></label>
                <label className="stacked-field"><span><FieldLabel>Direção das riscas</FieldLabel><b>{Math.round(stripeAngle)}°</b></span><input type="range" min={0} max={180} step={1} value={stripeAngle} onChange={(event) => updatePatternAppearance({ stripeAngle: Number(event.target.value) })} /></label>
                <label className="stacked-field"><span><FieldLabel>Espaçamento</FieldLabel><b>{Math.round(stripeSpacing * 540)}px</b></span><input type="range" min={.006} max={.04} step={.001} value={stripeSpacing} onChange={(event) => updatePatternAppearance({ stripeSpacing: Number(event.target.value) })} /></label>
              </>
            )}
          </>
        )}
        {object.data.kind === "text" && (
          <>
            <label className="field-row">
              <FieldLabel>Modelo do texto</FieldLabel>
              <select value={object.data.textDesign ?? "flat"} onChange={(event) => updateTextAppearance({ textDesign: event.target.value as TextDesign })}>
                <option value="flat">Texto normal</option>
                <option value="ground3d">3D no relvado</option>
              </select>
            </label>
            {(object.data.textDesign ?? "flat") === "ground3d" && (
              <>
                <label className="stacked-field"><span><FieldLabel>Inclinação no relvado</FieldLabel><b>{Math.round(object.data.groundTilt ?? -12)}°</b></span><input type="range" min={-35} max={35} step={1} value={object.data.groundTilt ?? -12} onChange={(event) => updateTextAppearance({ groundTilt: Number(event.target.value) })} /></label>
                <label className="stacked-field"><span><FieldLabel>Profundidade 3D</FieldLabel><b>{Math.round(object.data.groundDepth ?? 7)}px</b></span><input type="range" min={2} max={16} step={1} value={object.data.groundDepth ?? 7} onChange={(event) => updateTextAppearance({ groundDepth: Number(event.target.value) })} /></label>
              </>
            )}
          </>
        )}
        <div className="effect-presets"><button onClick={() => applyEffectPreset("clean")}>Clean</button><button onClick={() => applyEffectPreset("glow")}>TV Glow</button><button onClick={() => applyEffectPreset("shadow")}>Sombra</button></div>
        {object.data.kind === "line" && (
          <label className="field-row">
            <FieldLabel>Modelo da linha</FieldLabel>
            <select value={object.data.lineDesign ?? "single"} onChange={(event) => updateLineAppearance({ lineDesign: event.target.value as LineDesign })}>
              <option value="single">Uma cor</option>
              <option value="dual">Duas cores</option>
              <option value="fadeShadow">Sombra e fade</option>
            </select>
          </label>
        )}
        <label className="field-row"><FieldLabel>{isPlayerRing ? "Círculo exterior" : object.data.kind === "line" ? "Cor principal" : object.data.kind === "text" ? "Cor do texto" : object.data.kind === "zoom" ? "Cor da moldura" : object.data.kind === "glimpse" ? "Cor da visão" : "Traço"}</FieldLabel><input type="color" value={object.style.stroke.slice(0, 7)} onChange={(e) => updateStyle({ stroke: e.target.value })} /><code>{object.style.stroke.slice(0, 7)}</code></label>
        {object.data.kind === "line" && object.data.lineDesign === "dual" && (
          <label className="field-row"><FieldLabel>Cor da linha fina</FieldLabel><input type="color" value={(object.data.secondaryColor ?? "#ffffff").slice(0, 7)} onChange={(event) => updateLineAppearance({ secondaryColor: event.target.value })} /><code>{(object.data.secondaryColor ?? "#ffffff").slice(0, 7)}</code></label>
        )}
        {!["arrow", "longBallArrow", "line", "freeDraw", "text", "zoom", "glimpse", "ghost", "identifyPlayer", "spotlight"].includes(object.type) && (
          <label className="field-row"><FieldLabel>{isPlayerRing ? "Círculo interior" : "Preench."}</FieldLabel><input type="color" value={fillColor} onChange={(e) => updateStyle({ fill: isPlayerRing ? e.target.value : withFillOpacity(e.target.value, fillOpacity) })} /><code>{fillColor}</code></label>
        )}
        {supportsFill && <label className="stacked-field"><span><FieldLabel>Opacidade do preenchimento</FieldLabel><b>{Math.round(fillOpacity * 100)}%</b></span><input type="range" min={0} max={1} step={.05} value={fillOpacity} onChange={(event) => updateStyle({ fill: withFillOpacity(object.style.fill, Number(event.target.value)) })} /></label>}
        <label className="stacked-field"><span><FieldLabel>Espessura</FieldLabel><b>{object.style.strokeWidth}px</b></span><input type="range" min={1} max={16} value={object.style.strokeWidth} onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Opacidade</FieldLabel><b>{Math.round(object.style.opacity * 100)}%</b></span><input type="range" min={0.1} max={1} step={0.05} value={object.style.opacity} onChange={(e) => updateStyle({ opacity: Number(e.target.value) })} /></label>
        {hasFixedBlackShadow
          ? <label className="field-row"><FieldLabel>Sombra 3D</FieldLabel><input type="color" value="#000000" disabled /><code>#000000</code></label>
          : <label className="field-row"><FieldLabel>{isPlayerRing ? "Luz relvado" : "Efeito"}</FieldLabel><input type="color" value={(object.style.shadowColor ?? "#000000").slice(0, 7)} onChange={(e) => updateStyle({ shadowColor: e.target.value })} /><code>{(object.style.shadowColor ?? "#000000").slice(0, 7)}</code></label>}
        <label className="stacked-field"><span><FieldLabel>Suavidade</FieldLabel><b>{object.style.shadowBlur ?? 0}px</b></span><input type="range" min={0} max={40} value={object.style.shadowBlur ?? 0} onChange={(e) => updateStyle({ shadowBlur: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Força efeito</FieldLabel><b>{Math.round((object.style.shadowOpacity ?? 0) * 100)}%</b></span><input type="range" min={0} max={1} step={.05} value={object.style.shadowOpacity ?? 0} onChange={(e) => updateStyle({ shadowOpacity: Number(e.target.value) })} /></label>
        <div className="two-fields shadow-offset-fields"><label><FieldLabel>Sombra X</FieldLabel><input type="number" min={-30} max={30} value={object.style.shadowOffsetX ?? 0} onChange={(e) => updateStyle({ shadowOffsetX: Number(e.target.value) })} /></label><label><FieldLabel>Sombra Y</FieldLabel><input type="number" min={-30} max={30} value={object.style.shadowOffsetY ?? 0} onChange={(e) => updateStyle({ shadowOffsetY: Number(e.target.value) })} /></label></div>
        {!isPlayerRing && !["text", "zoom", "glimpse", "spotlight"].includes(object.type) && <label className="field-row"><FieldLabel>Estilo linha</FieldLabel><select value={object.style.dash.length ? "dashed" : "solid"} onChange={(event) => updateStyle({ dash: event.target.value === "dashed" ? [10, 7] : [] })}><option value="solid">Linha contínua</option><option value="dashed">Tracejado</option></select></label>}
        {object.data.kind === "spotlight" && (
          <>
            <label className="field-row"><FieldLabel>Modelo</FieldLabel><select value={object.data.design ?? "beam"} onChange={(event) => object.data.kind === "spotlight" && updateDrawing(object.id, { data: { ...object.data, design: event.target.value as "beam" | "isolation" } })}><option value="isolation">Isolar jogador</option><option value="beam">Feixe de luz</option></select></label>
            <label className="stacked-field"><span><FieldLabel>Largura no jogador</FieldLabel><b>{Math.round(object.data.radiusX * 200)}%</b></span><input type="range" min={.02} max={.14} step={.002} value={object.data.radiusX} onChange={(event) => object.data.kind === "spotlight" && updateDrawing(object.id, { data: { ...object.data, radiusX: Number(event.target.value) } })} /></label>
            <label className="stacked-field"><span><FieldLabel>{object.data.design === "isolation" ? "Área iluminada" : "Altura da luz"}</FieldLabel><b>{Math.round(object.data.beamHeight * 100)}%</b></span><input type="range" min={.08} max={.55} step={.01} value={object.data.beamHeight} onChange={(event) => object.data.kind === "spotlight" && updateDrawing(object.id, { data: { ...object.data, beamHeight: Number(event.target.value) } })} /></label>
            <label className="stacked-field"><span><FieldLabel>Base no relvado</FieldLabel><b>{Math.round(object.data.radiusY * 1000)}</b></span><input type="range" min={.006} max={.05} step={.001} value={object.data.radiusY} onChange={(event) => object.data.kind === "spotlight" && updateDrawing(object.id, { data: { ...object.data, radiusY: Number(event.target.value) } })} /></label>
            {(object.data.design ?? "beam") === "isolation" && <><label className="stacked-field"><span><FieldLabel>Escurecimento</FieldLabel><b>{Math.round((object.data.darkness ?? .68) * 100)}%</b></span><input type="range" min={.2} max={.9} step={.02} value={object.data.darkness ?? .68} onChange={(event) => object.data.kind === "spotlight" && updateDrawing(object.id, { data: { ...object.data, darkness: Number(event.target.value) } })} /></label><label className="stacked-field"><span><FieldLabel>Suavidade do recorte</FieldLabel><b>{Math.round((object.data.feather ?? .48) * 100)}%</b></span><input type="range" min={.05} max={.9} step={.02} value={object.data.feather ?? .48} onChange={(event) => object.data.kind === "spotlight" && updateDrawing(object.id, { data: { ...object.data, feather: Number(event.target.value) } })} /></label></>}
          </>
        )}
        {object.data.kind === "ghost" && (
          <>
            <p className="property-help">Arraste o jogador recortado diretamente no relvado para ajustar a nova posição.</p>
            <label className="toggle-row"><span><FieldLabel>Ocultar posição original</FieldLabel><small>Reconstrói o relvado por baixo do jogador</small></span><input type="checkbox" checked={object.data.hideOriginal !== false} onChange={(event) => object.data.kind === "ghost" && updateDrawing(object.id, { data: { ...object.data, hideOriginal: event.target.checked } })} /><span /></label>
            <label className="stacked-field"><span><FieldLabel>Tamanho do jogador</FieldLabel><b>{Math.round(object.transform.scaleX * 100)}%</b></span><input type="range" min={.45} max={2.2} step={.05} value={object.transform.scaleX} onChange={(event) => { const scale = Number(event.target.value); updateTransform({ scaleX: scale, scaleY: scale }); }} /></label>
            <label className="stacked-field"><span><FieldLabel>Opacidade do jogador</FieldLabel><b>{Math.round((object.data.playerOpacity ?? .96) * 100)}%</b></span><input type="range" min={.2} max={1} step={.05} value={object.data.playerOpacity ?? .96} onChange={(event) => object.data.kind === "ghost" && updateDrawing(object.id, { data: { ...object.data, playerOpacity: Number(event.target.value) } })} /></label>
          </>
        )}
        {object.data.kind === "longBallArrow" && (
          <label className="stacked-field"><span><FieldLabel>Altura da trajetória</FieldLabel><b>{Math.round(object.data.curveHeight * 100)}%</b></span><input type="range" min={.02} max={.34} step={.01} value={object.data.curveHeight} onChange={(event) => object.data.kind === "longBallArrow" && updateDrawing(object.id, { data: { ...object.data, curveHeight: Number(event.target.value) } })} /></label>
        )}
        {object.data.kind === "zoom" && (
          <>
            <label className="stacked-field"><span><FieldLabel>Ampliação</FieldLabel><b>{object.data.zoom.toFixed(1)}x</b></span><input type="range" min={1.2} max={4} step={.1} value={object.data.zoom} onChange={(event) => object.data.kind === "zoom" && updateDrawing(object.id, { data: { ...object.data, zoom: Number(event.target.value) } })} /></label>
            <label className="stacked-field"><span><FieldLabel>Tamanho da lupa</FieldLabel><b>{Math.round(object.data.radius * 200)}%</b></span><input type="range" min={.06} max={.28} step={.005} value={object.data.radius} onChange={(event) => object.data.kind === "zoom" && updateDrawing(object.id, { data: { ...object.data, radius: Number(event.target.value) } })} /></label>
          </>
        )}
        {object.data.kind === "glimpse" && (
          <>
            <label className="stacked-field"><span><FieldLabel>Abertura da visão</FieldLabel><b>{Math.round(object.data.spread)}°</b></span><input type="range" min={12} max={100} step={1} value={object.data.spread} onChange={(event) => object.data.kind === "glimpse" && updateDrawing(object.id, { data: { ...object.data, spread: Number(event.target.value) } })} /></label>
            <label className="stacked-field"><span><FieldLabel>Distância da visão</FieldLabel><b>{Math.round(glimpseLength * 100)}%</b></span><input type="range" min={.03} max={.55} step={.01} value={glimpseLength} onChange={(event) => updateGlimpseLength(Number(event.target.value))} /></label>
          </>
        )}
        {object.data.kind === "text" && <TextContentField value={object.data.text} onChange={(text) => object.data.kind === "text" && updateDrawing(object.id, { data: { ...object.data, text } })} />}
      </section>

      {supportsActionLabel && (
        <section className="property-section">
          <h3>NÚMERO DA AÇÃO</h3>
          <label className="toggle-row">
            <span><FieldLabel>Mostrar número</FieldLabel><small>Marcador sobre a linha ou seta</small></span>
            <input type="checkbox" checked={object.actionLabel?.visible ?? false} onChange={(event) => updateActionLabel({ visible: event.target.checked })} />
            <span />
          </label>
          {(object.actionLabel?.visible ?? false) && (
            <>
              <label className="field-row"><FieldLabel>Número / ação</FieldLabel><input type="text" maxLength={4} value={object.actionLabel?.value ?? "1"} onChange={(event) => updateActionLabel({ value: event.target.value })} /></label>
              <label className="stacked-field"><span><FieldLabel>Posição na linha</FieldLabel><b>{Math.round((object.actionLabel?.position ?? .5) * 100)}%</b></span><input type="range" min={.05} max={.95} step={.01} value={object.actionLabel?.position ?? .5} onChange={(event) => updateActionLabel({ position: Number(event.target.value) })} /></label>
              <label className="stacked-field"><span><FieldLabel>Tamanho</FieldLabel><b>{Math.round((object.actionLabel?.fontSize ?? .022) * 540)}px</b></span><input type="range" min={.014} max={.05} step={.002} value={object.actionLabel?.fontSize ?? .022} onChange={(event) => updateActionLabel({ fontSize: Number(event.target.value) })} /></label>
              <label className="field-row"><FieldLabel>Cor do número</FieldLabel><input type="color" value={(object.actionLabel?.color ?? "#ffffff").slice(0, 7)} onChange={(event) => updateActionLabel({ color: event.target.value })} /><code>{(object.actionLabel?.color ?? "#ffffff").slice(0, 7)}</code></label>
              <label className="field-row"><FieldLabel>Cor do marcador</FieldLabel><input type="color" value={(object.actionLabel?.backgroundColor ?? "#174ea6").slice(0, 7)} onChange={(event) => updateActionLabel({ backgroundColor: event.target.value })} /><code>{(object.actionLabel?.backgroundColor ?? "#174ea6").slice(0, 7)}</code></label>
            </>
          )}
        </section>
      )}

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
        <label className="field-row"><FieldLabel>Animação</FieldLabel><select value={object.animation?.motion === "pulse" ? "pulse" : "none"} onChange={(event) => updateDrawing(object.id, { animation: { ...object.animation, motion: event.target.value as "none" | "pulse", fadeIn: 0, fadeOut: 0 } })}><option value="none">Sem animação</option><option value="pulse">Pulse contínuo</option></select></label>
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
        <label className="toggle-row"><span><FieldLabel>Tracking</FieldLabel><small>{playerTrack ? `${playerTrack.name} · ${playerTrack.status === "processing" ? "a seguir até parar" : playerTrack.status === "seeded" ? "pronto para iniciar" : "tracking terminado"}` : "Sem jogador associado"}</small></span><input type="checkbox" checked={playerTrack ? playerTrack.status === "processing" : object.trackingEnabled} onChange={(e) => {
          const enabled = e.target.checked;
          if (playerTrack) {
            const driver = drawings.find((drawing) => drawing.data.kind === "identifyPlayer" && drawing.target?.trackId === playerTrack.id) ?? object;
            drawings.filter((drawing) => drawing.target?.trackId === playerTrack.id).forEach((drawing) => {
              updateDrawing(drawing.id, drawing.id === driver.id
                ? enabled
                  ? { trackingEnabled: true, endTime: Math.max(drawing.endTime, videoDuration || currentTime + 3) }
                  : { trackingEnabled: false, endTime: Math.max(drawing.startTime + .04, currentTime) }
                : { trackingEnabled: false });
            });
            setPlayerTrackStatus(playerTrack.id, enabled ? "processing" : "ready");
          } else {
            updateDrawing(object.id, enabled
              ? { trackingEnabled: true, endTime: Math.max(object.endTime, videoDuration || currentTime + 3) }
              : { trackingEnabled: false, endTime: Math.max(object.startTime + .04, currentTime) });
          }
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

function VideoSlidePresentationSettings({ content, slideDuration, caption, currentTime, videoDuration, onUpdate }: {
  slideId: string;
  content: VideoSlideContent;
  slideDuration: number;
  caption: string;
  currentTime: number;
  videoDuration: number;
  onUpdate: (patch: { content?: VideoSlideContent; duration?: number; caption?: string }) => void;
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
      <label className="slide-prop-field vertical"><span>Legenda no fundo da imagem</span><textarea rows={3} placeholder="Escreva a mensagem a apresentar..." value={caption} onChange={(event) => onUpdate({ caption: event.target.value })} /></label>
    </section>
  );
}
