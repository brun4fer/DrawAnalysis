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

type TacticalPhase = "idle" | "movement" | "drawing" | "complete";

function tacticalPhaseAt(content: { movements?: unknown[]; movementDuration?: number; movementHoldDuration?: number }, elapsed: number) {
  const movementCount = content.movements?.length ?? 0;
  const hold = Math.max(0, content.movementHoldDuration ?? .65);
  const travel = Math.max(.15, content.movementDuration ?? 1.2);
  const stepLength = travel + hold;
  if (!movementCount) return { phase: "complete" as TacticalPhase, index: -1, start: 0, end: 0, travel, hold };
  if (elapsed < hold) return { phase: "idle" as TacticalPhase, index: 0, start: hold, end: hold + travel, travel, hold };
  for (let index = 0; index < movementCount; index += 1) {
    const start = hold + index * stepLength;
    const movementEnd = start + travel;
    const drawingEnd = movementEnd + hold;
    if (elapsed < movementEnd) return { phase: "movement" as TacticalPhase, index, start, end: movementEnd, travel, hold };
    // Keep the completed drawing phase addressable at its endpoint. This lets
    // the left key return to the player positions before the drawings, while
    // the right key advances to the next movement only on a separate press.
    if (elapsed <= drawingEnd) return { phase: "drawing" as TacticalPhase, index, start: movementEnd, end: drawingEnd, travel, hold };
  }
  return { phase: "complete" as TacticalPhase, index: movementCount - 1, start: hold + (movementCount - 1) * stepLength, end: hold + movementCount * stepLength, travel, hold };
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
        const phase = tacticalPhaseAt(tacticalContent, currentActive.elapsed);
        const movementCount = tacticalContent.movements?.length ?? 0;
        const moveTo = (elapsed: number) => {
          const target = currentActive.start + Math.max(0, elapsed);
          playheadRef.current = target;
          setPlayhead(target);
          setPlaying(false);
        };
        const animateTo = (start: number, end: number) => {
          const safeStart = Math.max(0, start);
          const safeEnd = Math.max(safeStart, end);
          playheadRef.current = currentActive.start + safeStart;
          setPlayhead(currentActive.start + safeStart);
          if (safeEnd - safeStart < .01) {
            playheadRef.current = currentActive.start + safeEnd;
            setPlayhead(currentActive.start + safeEnd);
            setPlaying(false);
            return;
          }
          setTacticalAnimationEnd(currentActive.start + safeEnd);
          setPlaying(true);
        };
        if (event.key === "ArrowLeft") {
          if (phase.phase === "idle" || !movementCount) {
            goToSlide(currentActive.index - 1);
            return;
          }
          if (phase.phase === "drawing") {
            // The preceding click shows the player movement. Going back from
            // the drawing stage deliberately returns to that exact position,
            // before the new shapes appear.
            moveTo(currentActive.elapsed <= phase.start + .001 ? Math.max(0, phase.start - phase.travel) : phase.start);
            return;
          }
          if (phase.phase === "movement") {
            moveTo(phase.start);
            return;
          }
          moveTo(Math.max(0, phase.start + phase.travel));
          return;
        }
        if (!movementCount) {
          goToSlide(currentActive.index + 1);
          return;
        }
        if (phase.phase === "idle" || phase.phase === "movement") {
          animateTo(phase.start, phase.end);
          return;
        }
        if (phase.phase === "drawing" && currentActive.elapsed < phase.end - .02) {
          animateTo(phase.start, phase.end);
          return;
        }
        const nextIndex = phase.phase === "drawing" ? phase.index + 1 : movementCount;
        if (nextIndex < movementCount) {
          const nextStart = phase.hold + nextIndex * (phase.travel + phase.hold);
          animateTo(nextStart, nextStart + phase.travel);
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
