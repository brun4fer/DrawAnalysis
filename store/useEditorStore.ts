"use client";

import { create } from "zustand";
import type { DrawingObject, Tool } from "@/types/drawing";
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
}));
