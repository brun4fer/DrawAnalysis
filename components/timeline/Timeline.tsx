"use client";

import { useRef, useState } from "react";
import { ChevronDown, Layers3, Lock, Minus, PauseCircle, Plus, Scissors, X } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { formatTime } from "@/components/video/VideoControls";
import { freezeRange, getSourceDuration, sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";

const MIN_DURATION = 0.08;

export function Timeline() {
  const { drawings, duration, currentTime, selectedId, setCurrentTime, setSelectedId, setIsPlaying, updateDrawing, slides, selectedSlideId, updateSlide, insertFreezeFrame } = useEditorStore();
  const trackRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [freezeDuration, setFreezeDuration] = useState(2);
  const [freezeTargetSourceTime, setFreezeTargetSourceTime] = useState(0);
  const safeDuration = Math.max(duration, 1);
  const timelineWidth = `${zoom * 100}%`;
  const activeSlide = slides.find((slide) => slide.id === selectedSlideId);
  const videoContent = activeSlide?.content.kind === "video" ? activeSlide.content : null;
  const freezeFrames = videoContent?.freezeFrames ?? [];
  const sourceDuration = getSourceDuration(duration, freezeFrames);
  const sourceClipStart = Math.max(0, videoContent?.startTime ?? 0);
  const sourceClipEnd = Math.min(sourceDuration || safeDuration, (videoContent?.endTime ?? sourceDuration) || safeDuration);
  const clipStart = sourceTimeToTimeline(sourceClipStart, freezeFrames);
  const clipEnd = sourceTimeToTimeline(sourceClipEnd, freezeFrames);
  const currentPoint = timelineTimeToSource(currentTime, freezeFrames);

  const updateClip = (startTime: number, endTime: number) => {
    if (!activeSlide || !videoContent) return;
    updateSlide(activeSlide.id, { content: { ...videoContent, startTime: timelineTimeToSource(startTime, freezeFrames).sourceTime, endTime: timelineTimeToSource(endTime, freezeFrames).sourceTime } });
  };

  const addFreeze = () => {
    const seconds = Math.max(.25, Math.min(30, Number(freezeDuration)));
    if (!Number.isFinite(seconds) || currentPoint.freeze) return;
    insertFreezeFrame(freezeTargetSourceTime, seconds);
    setFreezeDialogOpen(false);
  };

  const openFreezeDialog = () => {
    if (currentPoint.freeze) return;
    setIsPlaying(false);
    setFreezeTargetSourceTime(currentPoint.sourceTime);
    setFreezeDialogOpen(true);
  };

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    setCurrentTime(Math.max(0, Math.min(safeDuration, (clientX - bounds.left) / bounds.width * safeDuration)));
  };

  const beginMove = (event: React.PointerEvent, id: string, mode: "move" | "start" | "end") => {
    event.stopPropagation();
    const object = drawings.find((item) => item.id === id);
    const track = trackRef.current;
    if (!object || !track) return;
    setSelectedId(id);
    const initialX = event.clientX;
    const initialStart = object.startTime;
    const initialEnd = object.endTime;
    const width = track.getBoundingClientRect().width;
    const onUp = (upEvent: PointerEvent) => {
      const delta = (upEvent.clientX - initialX) / width * safeDuration;
      if (mode === "move") {
        const length = initialEnd - initialStart;
        const start = Math.max(0, Math.min(safeDuration - length, initialStart + delta));
        updateDrawing(id, { startTime: start, endTime: start + length });
      } else if (mode === "start") {
        updateDrawing(id, { startTime: Math.max(0, Math.min(initialEnd - MIN_DURATION, initialStart + delta)) });
      } else {
        updateDrawing(id, { endTime: Math.min(safeDuration, Math.max(initialStart + MIN_DURATION, initialEnd + delta)) });
      }
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const beginClipTrim = (event: React.PointerEvent, mode: "move" | "start" | "end") => {
    event.stopPropagation();
    const track = trackRef.current;
    if (!track || !videoContent || !duration) return;
    const initialX = event.clientX;
    const initialStart = clipStart;
    const initialEnd = clipEnd;
    const width = track.getBoundingClientRect().width;
    const onUp = (upEvent: PointerEvent) => {
      const delta = (upEvent.clientX - initialX) / width * safeDuration;
      if (mode === "start") updateClip(Math.max(0, Math.min(initialEnd - MIN_DURATION, initialStart + delta)), initialEnd);
      if (mode === "end") updateClip(initialStart, Math.min(duration, Math.max(initialStart + MIN_DURATION, initialEnd + delta)));
      if (mode === "move") {
        const length = initialEnd - initialStart;
        const start = Math.max(0, Math.min(duration - length, initialStart + delta));
        updateClip(start, start + length);
      }
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const ticks = Array.from({ length: 11 }, (_, index) => index / 10 * safeDuration);

  return (
    <>
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div className="timeline-title"><Layers3 size={15} /> TIMELINE <span>{drawings.length} objetos</span></div>
        <div className="trim-toolbar">
          <Scissors size={13} />
          <button disabled={!duration || currentTime >= clipEnd - MIN_DURATION} onClick={() => updateClip(currentTime, clipEnd)}>Marcar IN</button>
          <code>{formatTime(clipStart, true)}</code>
          <span>→</span>
          <code>{formatTime(clipEnd, true)}</code>
          <button disabled={!duration || currentTime <= clipStart + MIN_DURATION} onClick={() => updateClip(clipStart, currentTime)}>Marcar OUT</button>
          <b>{Math.max(0, clipEnd - clipStart).toFixed(2)}s</b>
          <button className="freeze-frame-button" disabled={!duration || Boolean(currentPoint.freeze)} onClick={openFreezeDialog}><PauseCircle size={12} /> Parar imagem</button>
        </div>
        <div className="timeline-tools"><Lock size={14} /><button onClick={() => setZoom(Math.max(1, zoom - 0.25))}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(3, zoom + 0.25))}><Plus size={14} /></button></div>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <div className="ruler-label">FAIXAS <ChevronDown size={12} /></div>
          <div className="video-track-label"><span className="video-dot" /> Vídeo</div>
          {drawings.map((object) => <button key={object.id} className={selectedId === object.id ? "selected" : ""} onClick={() => setSelectedId(object.id)}><span className={`type-dot type-${object.type}`} />{object.name}</button>)}
        </div>
        <div className="tracks-scroll">
          <div className="tracks" ref={trackRef} style={{ width: timelineWidth }} onPointerDown={(e) => seekFromPointer(e.clientX)}>
            <div className="ruler">
              {ticks.map((tick) => <span key={tick} style={{ left: `${tick / safeDuration * 100}%` }}><i />{formatTime(tick)}</span>)}
            </div>
            <div className="video-track">
              <div className="video-wave">{Array.from({ length: 80 }, (_, i) => <i key={i} style={{ height: `${22 + (i * 17) % 58}%` }} />)}</div>
              {freezeFrames.map((freeze) => {
                const range = freezeRange(freeze, freezeFrames);
                return <button key={freeze.id} className="freeze-frame-clip" style={{ left: `${range.start / safeDuration * 100}%`, width: `${Math.max(.7, freeze.duration / safeDuration * 100)}%` }} onPointerDown={(event) => { event.stopPropagation(); setCurrentTime(range.start + freeze.duration / 2); }} title={`Imagem parada durante ${freeze.duration.toFixed(1)} segundos`}><PauseCircle size={10} /><span>{freeze.duration.toFixed(1)}s</span></button>;
              })}
              <div className="clip-outside left" style={{ width: `${clipStart / safeDuration * 100}%` }} />
              <div className="clip-outside right" style={{ width: `${Math.max(0, safeDuration - clipEnd) / safeDuration * 100}%` }} />
              <div className="video-trim-range" style={{ left: `${clipStart / safeDuration * 100}%`, width: `${Math.max(.2, (clipEnd - clipStart) / safeDuration * 100)}%` }} onPointerDown={(event) => beginClipTrim(event, "move")}>
                <i className="trim-handle left" onPointerDown={(event) => beginClipTrim(event, "start")}><span>IN</span></i>
                <i className="trim-handle right" onPointerDown={(event) => beginClipTrim(event, "end")}><span>OUT</span></i>
              </div>
            </div>
            {drawings.map((object) => (
              <div className="object-track" key={object.id}>
                <div
                  className={`object-clip type-${object.type} ${selectedId === object.id ? "selected" : ""}`}
                  style={{ left: `${object.startTime / safeDuration * 100}%`, width: `${Math.max(0.5, (object.endTime - object.startTime) / safeDuration * 100)}%` }}
                  onPointerDown={(e) => beginMove(e, object.id, "move")}
                >
                  <i className="clip-handle left" onPointerDown={(e) => beginMove(e, object.id, "start")} />
                  <span>{object.name}</span>
                  <i className="clip-handle right" onPointerDown={(e) => beginMove(e, object.id, "end")} />
                </div>
              </div>
            ))}
            <div className="playhead" style={{ left: `${currentTime / safeDuration * 100}%` }}><i /><span /></div>
          </div>
        </div>
      </div>
    </section>
    {freezeDialogOpen && (
      <div className="freeze-dialog-backdrop" onPointerDown={() => setFreezeDialogOpen(false)}>
        <div className="freeze-dialog" onPointerDown={(event) => event.stopPropagation()}>
          <button className="freeze-dialog-close" onClick={() => setFreezeDialogOpen(false)} aria-label="Fechar"><X size={17} /></button>
          <span className="freeze-dialog-icon"><PauseCircle size={24} /></span>
          <h2>Parar a imagem</h2>
          <p>Durante quanto tempo quer manter este fotograma parado?</p>
          <label><span>Duração</span><div><input autoFocus type="number" min={.25} max={30} step={.25} value={freezeDuration} onChange={(event) => setFreezeDuration(Number(event.target.value))} /><i>segundos</i></div></label>
          <small>Os desenhos criados nesta pausa aparecem apenas enquanto a imagem estiver parada.</small>
          <div className="freeze-dialog-actions"><button onClick={() => setFreezeDialogOpen(false)}>Cancelar</button><button onClick={addFreeze}>Adicionar pausa</button></div>
        </div>
      </div>
    )}
    </>
  );
}
