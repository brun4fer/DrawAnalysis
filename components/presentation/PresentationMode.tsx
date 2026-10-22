"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { getSlidePresentationDuration } from "@/utils/videoTimeline";

interface Props { onClose: () => void }

export function PresentationMode({ onClose }: Props) {
  const { slides, selectedSlideId } = useEditorStore();
  const durations = useMemo(() => slides.map(getSlidePresentationDuration), [slides]);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.id === selectedSlideId));
  const initialTime = durations.slice(0, initialIndex).reduce((total, duration) => total + duration, 0);
  const [playhead, setPlayhead] = useState(initialTime);
  const [playing, setPlaying] = useState(true);
  const [tacticalAnimationEnd, setTacticalAnimationEnd] = useState<number | null>(null);
  const playheadRef = useRef(initialTime);
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
  const isTacticalBoard = slide?.content.kind === "tactical-board";

  useEffect(() => {
    if (!playing || totalDuration <= 0 || (isTacticalBoard && tacticalAnimationEnd === null)) return;
    const tick = (now: number) => {
      const previous = previousFrameRef.current ?? now;
      previousFrameRef.current = now;
      const delta = Math.min(.1, Math.max(0, (now - previous) / 1000));
      let next = playheadRef.current + delta;
      if (isTacticalBoard && tacticalAnimationEnd !== null && next >= tacticalAnimationEnd) {
        next = tacticalAnimationEnd;
        playheadRef.current = next;
        setPlayhead(next);
        setTacticalAnimationEnd(null);
        setPlaying(false);
        return;
      }
      if (next >= totalDuration) {
        next = Math.max(0, totalDuration - .001);
        setPlaying(false);
      }
      playheadRef.current = next;
      setPlayhead(next);
      if (next >= totalDuration - .001) return;
      frameRef.current = requestAnimationFrame(tick);
    };
    previousFrameRef.current = null;
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousFrameRef.current = null;
    };
  }, [isTacticalBoard, playing, tacticalAnimationEnd, totalDuration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (isTacticalBoard) return;
        const direction = event.key === "ArrowLeft" ? -5 : 5;
        const next = Math.max(0, Math.min(Math.max(0, totalDuration - .001), playheadRef.current + direction));
        playheadRef.current = next;
        setPlayhead(next);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat) return;
        if (slide?.content.kind === "tactical-board") {
          if (tacticalAnimationEnd !== null) return;
          const movementCount = slide.content.movements?.length ?? 0;
          const hold = Math.max(0, slide.content.movementHoldDuration ?? .65);
          const travel = Math.max(.15, slide.content.movementDuration ?? 1.2);
          const stepLength = travel + hold;
          const completedMovements = Array.from({ length: movementCount }, (_, index) => hold + index * stepLength + travel)
            .filter((targetTime) => active.elapsed >= targetTime - .02).length;
          if (completedMovements < movementCount) {
            const transitionStart = hold + completedMovements * stepLength;
            const start = active.start + transitionStart;
            const end = start + travel;
            playheadRef.current = start;
            setPlayhead(start);
            setTacticalAnimationEnd(end);
            setPlaying(true);
            return;
          }
          const nextSlideStart = active.start + durations[active.index];
          if (active.index < slides.length - 1) {
            playheadRef.current = nextSlideStart;
            setPlayhead(nextSlideStart);
            setPlaying(true);
          } else {
            setPlaying(false);
          }
          return;
        }
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active.elapsed, active.index, active.start, durations, isTacticalBoard, onClose, slide, slides.length, tacticalAnimationEnd, totalDuration]);

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
    <div className="presentation-mode presentation-builder-preview presentation-clean" aria-label="Pré-visualização em ecrã inteiro. No quadro tático, Espaço avança um movimento de cada vez.">
      <div className="presentation-content">
        <SlideRenderer slide={slide} interactive={false} presentationTime={active.elapsed} presentationPlaying={playing} />
      </div>
    </div>
  );
}
