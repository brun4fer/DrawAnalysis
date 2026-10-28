"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { getSlidePresentationDuration } from "@/utils/videoTimeline";

interface Props { onClose: () => void }

const PRESENTATION_TICK_MS = 1000 / 30;
const MAX_TICK_DELTA_SECONDS = .1;

function getActiveSlide(playhead: number, durations: number[]) {
  let start = 0;
  for (let index = 0; index < durations.length; index += 1) {
    const end = start + durations[index];
    if (playhead < end || index === durations.length - 1) {
      return { index, start, elapsed: Math.max(0, playhead - start) };
    }
    start = end;
  }
  return { index: 0, start: 0, elapsed: 0 };
}

export function PresentationMode({ onClose }: Props) {
  const { slides, selectedSlideId } = useEditorStore();
  const durations = useMemo(() => slides.map(getSlidePresentationDuration), [slides]);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  const initialIndex = Math.max(0, slides.findIndex((slide) => slide.id === selectedSlideId));
  const initialTime = durations.slice(0, initialIndex).reduce((total, duration) => total + duration, 0);
  const [playhead, setPlayhead] = useState(initialTime);
  const [playing, setPlaying] = useState(slides[initialIndex]?.content.kind !== "tactical-board");
  const [tacticalAnimationEnd, setTacticalAnimationEnd] = useState<number | null>(null);
  const playheadRef = useRef(initialTime);
  const timerRef = useRef<number | null>(null);
  const previousTickRef = useRef<number | null>(null);
  const enteredFullscreenRef = useRef(false);

  const active = getActiveSlide(playhead, durations);
  const slide = slides[active.index];
  const isTacticalBoard = slide?.content.kind === "tactical-board";
  const activeSlideEnd = active.start + (durations[active.index] ?? 0);

  useEffect(() => {
    if (!playing || totalDuration <= 0 || (isTacticalBoard && tacticalAnimationEnd === null)) return;
    const tick = () => {
      const now = performance.now();
      const previous = previousTickRef.current ?? now;
      previousTickRef.current = now;
      const delta = Math.min(MAX_TICK_DELTA_SECONDS, Math.max(0, (now - previous) / 1000));
      let next = playheadRef.current + delta;
      if (isTacticalBoard && tacticalAnimationEnd !== null && next >= tacticalAnimationEnd) {
        next = tacticalAnimationEnd;
        const movementCount = slide.content.kind === "tactical-board" ? slide.content.movements?.length ?? 0 : 0;
        const hold = slide.content.kind === "tactical-board" ? Math.max(0, slide.content.movementHoldDuration ?? .65) : 0;
        const travel = slide.content.kind === "tactical-board" ? Math.max(.15, slide.content.movementDuration ?? 1.2) : 0;
        const lastMovementEnd = movementCount > 0
          ? active.start + hold + (movementCount - 1) * (travel + hold) + travel
          : Number.POSITIVE_INFINITY;
        if (next >= lastMovementEnd - .02 && active.index < slides.length - 1) {
          const nextSlideStart = activeSlideEnd;
          playheadRef.current = nextSlideStart;
          setPlayhead(nextSlideStart);
          setTacticalAnimationEnd(null);
          setPlaying(slides[active.index + 1]?.content.kind !== "tactical-board");
          return;
        }
        playheadRef.current = next;
        setPlayhead(next);
        setTacticalAnimationEnd(null);
        setPlaying(false);
        return;
      }
      if (next >= activeSlideEnd) {
        next = Math.max(active.start, activeSlideEnd - .001);
        playheadRef.current = next;
        setPlayhead(next);
        setPlaying(false);
        return;
      }
      playheadRef.current = next;
      startTransition(() => setPlayhead(next));
      if (next >= totalDuration - .001) return;
      timerRef.current = window.setTimeout(tick, PRESENTATION_TICK_MS);
    };
    previousTickRef.current = performance.now();
    timerRef.current = window.setTimeout(tick, PRESENTATION_TICK_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      previousTickRef.current = null;
    };
  }, [active.index, active.start, activeSlideEnd, isTacticalBoard, playing, slide, slides, tacticalAnimationEnd, totalDuration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const currentActive = getActiveSlide(playheadRef.current, durations);
      const currentSlide = slides[currentActive.index];
      const goToSlide = (index: number) => {
        if (index < 0 || index >= slides.length) return;
        const start = durations.slice(0, index).reduce((total, duration) => total + duration, 0);
        playheadRef.current = start;
        setPlayhead(start);
        setTacticalAnimationEnd(null);
        setPlaying(slides[index]?.content.kind !== "tactical-board");
      };
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (currentSlide?.content.kind !== "tactical-board") {
          goToSlide(currentActive.index + (event.key === "ArrowLeft" ? -1 : 1));
          return;
        }
        if (tacticalAnimationEnd !== null) return;
        const tacticalContent = currentSlide.content;
        const movementCount = tacticalContent.movements?.length ?? 0;
        const hold = Math.max(0, tacticalContent.movementHoldDuration ?? .65);
        const travel = Math.max(.15, tacticalContent.movementDuration ?? 1.2);
        const stepLength = travel + hold;
        const completionTimes = Array.from({ length: movementCount }, (_, index) => hold + index * stepLength + travel);
        const completedMovements = completionTimes.filter((targetTime) => currentActive.elapsed >= targetTime - .02).length;
        if (event.key === "ArrowLeft") {
          if (completedMovements <= 0) {
            goToSlide(currentActive.index - 1);
            return;
          }
          const previousStep = completedMovements - 1;
          const targetElapsed = previousStep === 0 ? 0 : completionTimes[previousStep - 1];
          const target = currentActive.start + targetElapsed;
          playheadRef.current = target;
          setPlayhead(target);
          setPlaying(false);
          return;
        }
        if (completedMovements < movementCount) {
          const transitionStart = hold + completedMovements * stepLength;
          const start = currentActive.start + transitionStart;
          const end = start + travel;
          playheadRef.current = start;
          setPlayhead(start);
          setTacticalAnimationEnd(end);
          setPlaying(true);
          return;
        }
        goToSlide(currentActive.index + 1);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat) return;
        if (currentSlide?.content.kind === "video") setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [durations, onClose, slides, tacticalAnimationEnd]);

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
    <div className="presentation-mode presentation-builder-preview presentation-clean" aria-label="Pré-visualização em ecrã inteiro. Use as setas para navegar e Espaço para reproduzir ou pausar vídeos.">
      <div className="presentation-content">
        <SlideRenderer slide={slide} interactive={false} presentationTime={active.elapsed} presentationPlaying={playing} />
      </div>
    </div>
  );
}
