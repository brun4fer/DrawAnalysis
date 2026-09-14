"use client";

import { create } from "zustand";
import type { DrawingObject, Tool } from "@/types/drawing";
import type { PresentationSlide } from "@/types/presentation";
import { createId } from "@/utils/id";

interface Snapshot { drawings: DrawingObject[] }

interface EditorState {
  tool: Tool;
  drawings: DrawingObject[];
  selectedId: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  history: Snapshot[];
  future: Snapshot[];
  slides: PresentationSlide[];
  selectedSlideId: string | null;
  setTool: (tool: Tool) => void;
  setSelectedId: (id: string | null) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  addDrawing: (drawing: DrawingObject) => void;
  updateDrawing: (id: string, patch: Partial<DrawingObject>) => void;
  removeDrawing: (id: string) => void;
  duplicateDrawing: (id: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  addSlide: (slide: PresentationSlide) => void;
  updateSlide: (id: string, patch: Partial<PresentationSlide>) => void;
  removeSlide: (id: string) => void;
  moveSlide: (id: string, direction: -1 | 1) => void;
  setSelectedSlideId: (id: string | null) => void;
}

const copy = (drawings: DrawingObject[]) => structuredClone(drawings);

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "select",
  drawings: [],
  selectedId: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  history: [],
  future: [],
  slides: [],
  selectedSlideId: null,
  setTool: (tool) => set({ tool }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  addDrawing: (drawing) => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings) }].slice(-80),
    future: [],
    drawings: [...state.drawings, drawing],
    selectedId: drawing.id,
  })),
  updateDrawing: (id, patch) => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings) }].slice(-80),
    future: [],
    drawings: state.drawings.map((drawing) => drawing.id === id ? { ...drawing, ...patch } : drawing),
  })),
  removeDrawing: (id) => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings) }].slice(-80),
    future: [],
    drawings: state.drawings.filter((drawing) => drawing.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
  })),
  duplicateDrawing: (id) => {
    const original = get().drawings.find((drawing) => drawing.id === id);
    if (!original) return;
    const duplicate = structuredClone(original);
    duplicate.id = createId();
    duplicate.name = `${original.name} copy`;
    duplicate.transform.x += 0.02;
    duplicate.transform.y += 0.02;
    get().addDrawing(duplicate);
  },
  undo: () => set((state) => {
    const previous = state.history.at(-1);
    if (!previous) return state;
    return {
      drawings: copy(previous.drawings),
      history: state.history.slice(0, -1),
      future: [{ drawings: copy(state.drawings) }, ...state.future],
      selectedId: previous.drawings.some((item) => item.id === state.selectedId) ? state.selectedId : null,
    };
  }),
  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    return {
      drawings: copy(next.drawings),
      history: [...state.history, { drawings: copy(state.drawings) }],
      future: state.future.slice(1),
      selectedId: next.drawings.some((item) => item.id === state.selectedId) ? state.selectedId : null,
    };
  }),
  reset: () => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings) }].slice(-80),
    future: [],
    drawings: [],
    selectedId: null,
    currentTime: 0,
  })),
  addSlide: (slide) => set((state) => ({
    slides: [...state.slides, slide],
    selectedSlideId: slide.id,
  })),
  updateSlide: (id, patch) => set((state) => ({
    slides: state.slides.map((slide) => slide.id === id ? { ...slide, ...patch } : slide),
  })),
  removeSlide: (id) => set((state) => {
    const index = state.slides.findIndex((slide) => slide.id === id);
    const slides = state.slides.filter((slide) => slide.id !== id);
    const fallback = slides[Math.min(index, slides.length - 1)]?.id ?? null;
    return { slides, selectedSlideId: state.selectedSlideId === id ? fallback : state.selectedSlideId };
  }),
  moveSlide: (id, direction) => set((state) => {
    const index = state.slides.findIndex((slide) => slide.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.slides.length) return state;
    const slides = [...state.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    return { slides };
  }),
  setSelectedSlideId: (selectedSlideId) => set({ selectedSlideId }),
}));
