"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { getSlidePresentationDuration } from "@/utils/videoTimeline";

interface Props { onClose: () => void }

export function PresentationMode({ onClose }: Props) {
  const { slides, selectedSlideId } = useEditorStore();
  const durations = slides.map(getSlidePresentationDuration);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.id === selectedSlideId));
  const initialTime = durations.slice(0, initialIndex).reduce((total, duration) => total + duration, 0);
  const [playhead, setPlayhead] = useState(initialTime);
  const [playing, setPlaying] = useState(true);
  const frameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<number | null>(null);
  const enteredFullscreenRef = useRef(false);

  const active = (() => {
    let start = 0;
    for (let index = 0; index < slides.length; index += 1) {
      const end = start + durations[index];
      if (playhead < end || index === slides.length - 1) return { index, start, elapsed: Math.max(0, playhead - start) };
      start = end;
    }
    return { index: 0, start: 0, elapsed: 0 };
  })();
  const slide = slides[active.index];

  useEffect(() => {
    if (!playing || totalDuration <= 0) return;
    const tick = (now: number) => {
      const previous = previousFrameRef.current ?? now;
      previousFrameRef.current = now;
      const delta = Math.min(.1, Math.max(0, (now - previous) / 1000));
      setPlayhead((current) => {
        const next = current + delta;
        if (next >= totalDuration) {
          setPlaying(false);
          return Math.max(0, totalDuration - .001);
        }
        return next;
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    previousFrameRef.current = null;
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousFrameRef.current = null;
    };
  }, [playing, totalDuration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -5 : 5;
        setPlayhead((value) => Math.max(0, Math.min(Math.max(0, totalDuration - .001), value + direction)));
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, totalDuration]);

  useEffect(() => {
    if (document.fullscreenElement) enteredFullscreenRef.current = true;
    const onFullscreenChange = () => {
      if (document.fullscreenElement) enteredFullscreenRef.current = true;
      else if (enteredFullscreenRef.current) onClose();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [onClose]);

  if (!slide) return null;
  return (
    <div className="presentation-mode presentation-builder-preview presentation-clean" aria-label="Pré-visualização em ecrã inteiro. Espaço pausa; setas avançam ou recuam cinco segundos.">
      <div className="presentation-content">
        <SlideRenderer slide={slide} interactive={false} presentationTime={active.elapsed} presentationPlaying={playing} />
      </div>
    </div>
  );
}
