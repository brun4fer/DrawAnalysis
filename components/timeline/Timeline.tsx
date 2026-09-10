"use client";

import { useRef, useState } from "react";
import { ChevronDown, Layers3, Lock, Minus, Plus } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { formatTime } from "@/components/video/VideoControls";

const MIN_DURATION = 0.08;

export function Timeline() {
  const { drawings, duration, currentTime, selectedId, setCurrentTime, setSelectedId, updateDrawing } = useEditorStore();
  const trackRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const safeDuration = Math.max(duration, 1);
  const timelineWidth = `${zoom * 100}%`;

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

  const ticks = Array.from({ length: 11 }, (_, index) => index / 10 * safeDuration);

  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div className="timeline-title"><Layers3 size={15} /> TIMELINE <span>{drawings.length} objetos</span></div>
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
            <div className="video-track"><div className="video-wave">{Array.from({ length: 80 }, (_, i) => <i key={i} style={{ height: `${22 + (i * 17) % 58}%` }} />)}</div></div>
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
  );
}
