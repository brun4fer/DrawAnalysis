"use client";

import { create } from "zustand";
import type { DrawingKeyframe, DrawingObject, PlayerTrack, PlayerTrackSample, Tool, ToolFavorite } from "@/types/drawing";
import type { AnalysisSlide, FreezeFrame } from "@/types/slide";
import { createId } from "@/utils/id";
import { createSlide } from "@/utils/slideFactory";
import { sourceTimeToTimeline } from "@/utils/videoTimeline";
import { normalizePresentationSlides } from "@/utils/presentationData";
import { favoriteFromDrawing, isToolFavorite } from "@/utils/toolFavorites";

interface Snapshot { drawings: DrawingObject[]; slides: AnalysisSlide[] }

interface EditorState {
  tool: Tool;
  drawings: DrawingObject[];
  selectedId: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  history: Snapshot[];
  future: Snapshot[];
  slides: AnalysisSlide[];
  selectedSlideId: string | null;
  favorites: ToolFavorite[];
  activeFavoriteId: string | null;
  favoriteStorageKey: string;
  setTool: (tool: Tool) => void;
  setSelectedId: (id: string | null) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  addDrawing: (drawing: DrawingObject) => void;
  addPlayerTrack: (track: PlayerTrack) => void;
  appendPlayerTrackingSample: (drawingId: string, trackId: string, sample: PlayerTrackSample, keyframe: DrawingKeyframe) => void;
  setPlayerTrackStatus: (trackId: string, status: PlayerTrack["status"]) => void;
  updateDrawing: (id: string, patch: Partial<DrawingObject>) => void;
  removeDrawing: (id: string) => void;
  duplicateDrawing: (id: string) => void;
  moveDrawingLayer: (id: string, direction: -1 | 1) => void;
  reorderDrawing: (id: string, targetId: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  addSlide: (slide: AnalysisSlide) => void;
  updateSlide: (id: string, patch: Partial<AnalysisSlide>) => void;
  removeSlide: (id: string) => void;
  duplicateSlide: (id: string) => void;
  moveSlide: (id: string, direction: -1 | 1) => void;
  reorderSlide: (id: string, targetId: string) => void;
  setSelectedSlideId: (id: string | null) => void;
  replacePresentation: (slides: AnalysisSlide[]) => void;
  setVideoSource: (id: string, sourceUrl?: string) => void;
  insertFreezeFrame: (sourceTime: number, duration: number) => void;
  loadFavorites: (storageKey: string) => void;
  saveDrawingAsFavorite: (drawingId: string) => void;
  removeFavorite: (favoriteId: string) => void;
  activateFavorite: (favoriteId: string) => void;
}

const copy = (drawings: DrawingObject[]) => structuredClone(drawings);
const copySlides = (slides: AnalysisSlide[]) => structuredClone(slides);
const initialVideoSlide = { ...createSlide("video", 0), id: "initial-video-slide", name: "Vídeo / Jogada" };
const DEFAULT_FAVORITES_KEY = "tactidraw:tool-favorites";

function persistFavorites(storageKey: string, favorites: ToolFavorite[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(favorites));
  void fetch("/api/tool-favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorites }),
  }).catch(() => undefined);
}

function withVideoDrawings(slides: AnalysisSlide[], selectedSlideId: string | null, drawings: DrawingObject[]) {
  return slides.map((slide) => slide.id === selectedSlideId && slide.content.kind === "video"
    ? { ...slide, content: { ...slide.content, drawings } }
    : slide);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "select",
  drawings: [],
  selectedId: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  history: [],
  future: [],
  slides: [initialVideoSlide],
  selectedSlideId: initialVideoSlide.id,
  favorites: [],
  activeFavoriteId: null,
  favoriteStorageKey: DEFAULT_FAVORITES_KEY,
  setTool: (tool) => set({ tool, activeFavoriteId: null }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  addDrawing: (drawing) => set((state) => {
    const drawings = [...state.drawings, drawing];
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], drawings, slides: withVideoDrawings(state.slides, state.selectedSlideId, drawings), selectedId: drawing.id,
    };
  }),
  addPlayerTrack: (track) => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
    future: [],
    slides: state.slides.map((slide) => slide.id === state.selectedSlideId && slide.content.kind === "video"
      ? { ...slide, content: { ...slide.content, playerTracks: [...(slide.content.playerTracks ?? []), track] } }
      : slide),
  })),
  appendPlayerTrackingSample: (drawingId, trackId, sample, keyframe) => set((state) => {
    const drawings = state.drawings.map((drawing) => {
      if (drawing.id !== drawingId) return drawing;
      if (drawing.target?.referenceFoot) return drawing;
      const frames = drawing.keyframes.length
        ? drawing.keyframes
        : [{ time: drawing.startTime, x: 0, y: 0, scaleX: 1, scaleY: 1 }];
      const nearbyIndex = frames.findIndex((frame) => Math.abs(frame.time - keyframe.time) < .04);
      const keyframes = nearbyIndex >= 0
        ? frames.map((frame, index) => index === nearbyIndex ? keyframe : frame)
        : [...frames, keyframe].sort((a, b) => a.time - b.time);
      return { ...drawing, keyframes };
    });
    let slides = withVideoDrawings(state.slides, state.selectedSlideId, drawings);
    slides = slides.map((slide) => slide.id === state.selectedSlideId && slide.content.kind === "video"
      ? {
          ...slide,
          content: {
            ...slide.content,
            playerTracks: (slide.content.playerTracks ?? []).map((track) => {
              if (track.id !== trackId) return track;
              const nearbyIndex = track.samples.findIndex((item) => Math.abs(item.time - sample.time) < .04);
              const samples = nearbyIndex >= 0
                ? track.samples.map((item, index) => index === nearbyIndex ? sample : item)
                : [...track.samples, sample].sort((a, b) => a.time - b.time);
              return { ...track, status: "processing" as const, samples };
            }),
          },
        }
      : slide);
    return { drawings, slides };
  }),
  setPlayerTrackStatus: (trackId, status) => set((state) => ({
    slides: state.slides.map((slide) => slide.id === state.selectedSlideId && slide.content.kind === "video"
      ? {
          ...slide,
          content: {
            ...slide.content,
            playerTracks: (slide.content.playerTracks ?? []).map((track) => track.id === trackId ? { ...track, status } : track),
          },
        }
      : slide),
  })),
  updateDrawing: (id, patch) => set((state) => {
    const drawings = state.drawings.map((drawing) => drawing.id === id ? { ...drawing, ...patch } : drawing);
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], drawings, slides: withVideoDrawings(state.slides, state.selectedSlideId, drawings),
    };
  }),
  removeDrawing: (id) => set((state) => {
    const drawings = state.drawings.filter((drawing) => drawing.id !== id);
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], drawings, slides: withVideoDrawings(state.slides, state.selectedSlideId, drawings),
      selectedId: state.selectedId === id ? null : state.selectedId,
    };
  }),
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
  moveDrawingLayer: (id, direction) => set((state) => {
    const index = state.drawings.findIndex((drawing) => drawing.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.drawings.length) return state;
    const drawings = [...state.drawings];
    [drawings[index], drawings[target]] = [drawings[target], drawings[index]];
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [],
      drawings,
      slides: withVideoDrawings(state.slides, state.selectedSlideId, drawings),
    };
  }),
  reorderDrawing: (id, targetId) => set((state) => {
    const sourceIndex = state.drawings.findIndex((drawing) => drawing.id === id);
    const targetIndex = state.drawings.findIndex((drawing) => drawing.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;
    const drawings = [...state.drawings];
    const [moved] = drawings.splice(sourceIndex, 1);
    drawings.splice(targetIndex, 0, moved);
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [],
      drawings,
      slides: withVideoDrawings(state.slides, state.selectedSlideId, drawings),
    };
  }),
  undo: () => set((state) => {
    const previous = state.history.at(-1);
    if (!previous) return state;
    const selectedSlideId = previous.slides.some((slide) => slide.id === state.selectedSlideId)
      ? state.selectedSlideId
      : previous.slides.at(-1)?.id ?? null;
    return {
      drawings: copy(previous.drawings),
      slides: copySlides(previous.slides),
      history: state.history.slice(0, -1),
      future: [{ drawings: copy(state.drawings), slides: copySlides(state.slides) }, ...state.future],
      selectedId: previous.drawings.some((item) => item.id === state.selectedId) ? state.selectedId : null,
      selectedSlideId,
    };
  }),
  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    const selectedSlideId = next.slides.some((slide) => slide.id === state.selectedSlideId)
      ? state.selectedSlideId
      : next.slides.at(-1)?.id ?? null;
    return {
      drawings: copy(next.drawings),
      slides: copySlides(next.slides),
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }],
      future: state.future.slice(1),
      selectedId: next.drawings.some((item) => item.id === state.selectedId) ? state.selectedId : null,
      selectedSlideId,
    };
  }),
  reset: () => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
    future: [],
    drawings: [],
    slides: withVideoDrawings(state.slides, state.selectedSlideId, []),
    selectedId: null,
    currentTime: 0,
  })),
  addSlide: (slide) => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
    future: [],
    slides: [...state.slides, slide],
    selectedSlideId: slide.id,
    selectedId: null,
    drawings: slide.content.kind === "video" ? copy(slide.content.drawings) : state.drawings,
  })),
  updateSlide: (id, patch) => set((state) => ({
    history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
    future: [],
    slides: state.slides.map((slide) => slide.id === id ? { ...slide, ...patch } : slide),
  })),
  removeSlide: (id) => set((state) => {
    const index = state.slides.findIndex((slide) => slide.id === id);
    const slides = state.slides.filter((slide) => slide.id !== id);
    const fallback = slides[Math.min(index, slides.length - 1)]?.id ?? null;
    const fallbackSlide = slides.find((slide) => slide.id === fallback);
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], slides, selectedSlideId: state.selectedSlideId === id ? fallback : state.selectedSlideId,
      selectedId: state.selectedSlideId === id ? null : state.selectedId,
      drawings: state.selectedSlideId === id && fallbackSlide?.content.kind === "video" ? copy(fallbackSlide.content.drawings) : state.drawings,
    };
  }),
  duplicateSlide: (id) => {
    const state = get();
    const index = state.slides.findIndex((slide) => slide.id === id);
    if (index < 0) return;
    const duplicate = structuredClone(state.slides[index]);
    duplicate.id = createId();
    duplicate.name = `${duplicate.name} — cópia`;
    const slides = [...state.slides];
    slides.splice(index + 1, 0, duplicate);
    set({
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], slides, selectedSlideId: duplicate.id,
      selectedId: null,
      drawings: duplicate.content.kind === "video" ? copy(duplicate.content.drawings) : state.drawings,
    });
  },
  moveSlide: (id, direction) => set((state) => {
    const index = state.slides.findIndex((slide) => slide.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.slides.length) return state;
    const slides = [...state.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], slides,
    };
  }),
  reorderSlide: (id, targetId) => set((state) => {
    const sourceIndex = state.slides.findIndex((slide) => slide.id === id);
    const targetIndex = state.slides.findIndex((slide) => slide.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;
    const slides = [...state.slides];
    const [moved] = slides.splice(sourceIndex, 1);
    slides.splice(targetIndex, 0, moved);
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [], slides,
    };
  }),
  setSelectedSlideId: (selectedSlideId) => set((state) => {
    const slide = state.slides.find((item) => item.id === selectedSlideId);
    return {
      selectedSlideId,
      selectedId: null,
      drawings: slide?.content.kind === "video" ? copy(slide.content.drawings) : state.drawings,
    };
  }),
  replacePresentation: (slides) => set(() => {
    const safeSlides = copySlides(normalizePresentationSlides(slides));
    const selectedSlideId = safeSlides[0]?.id ?? null;
    const first = safeSlides[0];
    return {
      slides: safeSlides,
      selectedSlideId,
      drawings: first?.content.kind === "video" ? copy(first.content.drawings) : [],
      selectedId: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      history: [],
      future: [],
      tool: "select",
    };
  }),
  setVideoSource: (id, sourceUrl) => set((state) => ({
    slides: state.slides.map((slide) => slide.id === id && slide.content.kind === "video"
      ? { ...slide, content: { ...slide.content, sourceUrl } }
      : slide),
  })),
  insertFreezeFrame: (sourceTime, requestedDuration) => set((state) => {
    const freezeDuration = Math.max(.25, Math.min(30, requestedDuration));
    const activeSlide = state.slides.find((slide) => slide.id === state.selectedSlideId);
    if (!activeSlide || activeSlide.content.kind !== "video") return state;
    const existingFreezes = activeSlide.content.freezeFrames ?? [];
    const insertionTime = sourceTimeToTimeline(sourceTime, existingFreezes);
    const freeze: FreezeFrame = { id: createId(), sourceTime, duration: freezeDuration };
    const shiftTime = (time: number, includeBoundary: boolean) => includeBoundary ? time >= insertionTime : time > insertionTime;
    const drawings = state.drawings.map((drawing) => ({
      ...drawing,
      startTime: shiftTime(drawing.startTime, false) ? drawing.startTime + freezeDuration : drawing.startTime,
      endTime: shiftTime(drawing.endTime, true) ? drawing.endTime + freezeDuration : drawing.endTime,
      keyframes: drawing.keyframes.map((keyframe) => shiftTime(keyframe.time, false) ? { ...keyframe, time: keyframe.time + freezeDuration } : keyframe),
    }));
    const playerTracks = (activeSlide.content.playerTracks ?? []).map((track) => ({
      ...track,
      samples: track.samples.map((sample) => shiftTime(sample.time, false) ? { ...sample, time: sample.time + freezeDuration } : sample),
    }));
    const freezeFrames = [...existingFreezes, freeze].sort((left, right) => left.sourceTime - right.sourceTime);
    const slides = state.slides.map((slide) => slide.id === activeSlide.id && slide.content.kind === "video"
      ? { ...slide, content: { ...slide.content, drawings, playerTracks, freezeFrames } }
      : slide);
    return {
      history: [...state.history, { drawings: copy(state.drawings), slides: copySlides(state.slides) }].slice(-80),
      future: [],
      drawings,
      slides,
      duration: state.duration + freezeDuration,
      currentTime: insertionTime + Math.min(.01, freezeDuration / 2),
      isPlaying: false,
      selectedId: null,
    };
  }),
  loadFavorites: (storageKey) => {
    if (typeof window === "undefined") return;
    let localFavorites: ToolFavorite[] = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
      localFavorites = Array.isArray(parsed) ? parsed.filter(isToolFavorite).slice(0, 24) : [];
      set({
        favoriteStorageKey: storageKey,
        favorites: localFavorites,
        activeFavoriteId: null,
      });
    } catch {
      set({ favoriteStorageKey: storageKey, favorites: [], activeFavoriteId: null });
    }
    void fetch("/api/tool-favorites")
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { favorites?: unknown };
        const cloudFavorites = Array.isArray(result.favorites) ? result.favorites.filter(isToolFavorite).slice(0, 24) : [];
        if (get().favoriteStorageKey !== storageKey) return;
        if (cloudFavorites.length || !localFavorites.length) {
          window.localStorage.setItem(storageKey, JSON.stringify(cloudFavorites));
          set({ favorites: cloudFavorites, activeFavoriteId: null });
        } else {
          persistFavorites(storageKey, localFavorites);
        }
      })
      .catch(() => undefined);
  },
  saveDrawingAsFavorite: (drawingId) => set((state) => {
    const drawing = state.drawings.find((item) => item.id === drawingId);
    if (!drawing) return state;
    const sameTypeCount = state.favorites.filter((item) => item.type === drawing.type).length + 1;
    const favorite = favoriteFromDrawing(drawing, createId());
    favorite.name = `${drawing.name || drawing.type} · ${sameTypeCount}`;
    const favorites = [...state.favorites, favorite].slice(-24);
    persistFavorites(state.favoriteStorageKey, favorites);
    return { favorites, activeFavoriteId: null };
  }),
  removeFavorite: (favoriteId) => set((state) => {
    const favorites = state.favorites.filter((item) => item.id !== favoriteId);
    persistFavorites(state.favoriteStorageKey, favorites);
    return { favorites, activeFavoriteId: state.activeFavoriteId === favoriteId ? null : state.activeFavoriteId };
  }),
  activateFavorite: (favoriteId) => set((state) => {
    const favorite = state.favorites.find((item) => item.id === favoriteId);
    return favorite ? { activeFavoriteId: favorite.id, tool: favorite.type } : state;
  }),
}));
