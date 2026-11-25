"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { getSlidePresentationDuration } from "@/utils/videoTimeline";
import type { TrainingSessionDetails } from "@/types/slide";

interface Props { onClose: () => void; trainingSession?: TrainingSessionDetails | null }

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

function tacticalStepEnd(content: { movements?: unknown[]; movementDuration?: number; movementHoldDuration?: number }, completedSteps: number) {
  const completed = Math.max(0, completedSteps);
  if (!completed) return 0;
  const hold = Math.max(0, content.movementHoldDuration ?? .65);
  const travel = Math.max(.15, content.movementDuration ?? 1.2);
  const movementIndex = Math.floor((completed - 1) / 2);
  const movementStart = hold + movementIndex * (travel + hold);
  return movementStart + (completed % 2 === 1 ? travel : travel + hold);
}

function tacticalStepRange(content: { movements?: unknown[]; movementDuration?: number; movementHoldDuration?: number }, completedSteps: number) {
  const hold = Math.max(0, content.movementHoldDuration ?? .65);
  const travel = Math.max(.15, content.movementDuration ?? 1.2);
  const movementIndex = Math.floor(completedSteps / 2);
  const movementStart = hold + movementIndex * (travel + hold);
  return completedSteps % 2 === 0
    ? { start: movementStart, end: movementStart + travel }
    : { start: movementStart + travel, end: movementStart + travel + hold };
}

export function PresentationMode({ onClose, trainingSession }: Props) {
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
  const tacticalStepRef = useRef({ slideId: "", completed: 0 });
  const tacticalAnimatingRef = useRef(false);

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
        tacticalAnimatingRef.current = false;
        setPlaying(false);
        return;
      }
      if (next >= activeSlideEnd) {
        next = Math.max(active.start, activeSlideEnd - .001);
        playheadRef.current = next;
        setPlayhead(next);
        setPlaying(false);
        tacticalAnimatingRef.current = false;
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
        tacticalAnimatingRef.current = false;
        tacticalStepRef.current = slides[index]?.content.kind === "tactical-board"
          ? { slideId: slides[index].id, completed: 0 }
          : { slideId: "", completed: 0 };
        setPlaying(slides[index]?.content.kind !== "tactical-board");
      };
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (currentSlide?.content.kind !== "tactical-board") {
          goToSlide(currentActive.index + (event.key === "ArrowLeft" ? -1 : 1));
          return;
        }
        if (tacticalAnimationEnd !== null || tacticalAnimatingRef.current) return;
        const tacticalContent = currentSlide.content;
        const movementCount = tacticalContent.movements?.length ?? 0;
        const totalSteps = movementCount * 2;
        if (tacticalStepRef.current.slideId !== currentSlide.id) tacticalStepRef.current = { slideId: currentSlide.id, completed: 0 };
        const moveTo = (elapsed: number) => {
          const target = currentActive.start + Math.max(0, elapsed);
          playheadRef.current = target;
          setPlayhead(target);
          setPlaying(false);
          tacticalAnimatingRef.current = false;
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
            tacticalAnimatingRef.current = false;
            return;
          }
          tacticalAnimatingRef.current = true;
          setTacticalAnimationEnd(currentActive.start + safeEnd);
          setPlaying(true);
        };
        if (event.key === "ArrowLeft") {
          const completed = tacticalStepRef.current.completed;
          if (!completed || !movementCount) {
            goToSlide(currentActive.index - 1);
            return;
          }
          const previousCompleted = completed - 1;
          tacticalStepRef.current = { slideId: currentSlide.id, completed: previousCompleted };
          moveTo(tacticalStepEnd(tacticalContent, previousCompleted));
          return;
        }
        if (!movementCount) {
          goToSlide(currentActive.index + 1);
          return;
        }
        const completed = tacticalStepRef.current.completed;
        if (completed < totalSteps) {
          const range = tacticalStepRange(tacticalContent, completed);
          tacticalStepRef.current = { slideId: currentSlide.id, completed: completed + 1 };
          animateTo(range.start, range.end);
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
        {/* A video preview owns media, drawing and timeline state. Remount it
            when the presentation moves to another slide so a decoded frame or
            overlay from the previous slide can never be reused. */}
        <SlideRenderer key={slide.id} slide={slide} interactive={false} trainingSession={trainingSession} presentationTime={active.elapsed} presentationPlaying={playing} />
      </div>
    </div>
  );
}
