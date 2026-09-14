"use client";

import { useEffect, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/VideoPlayer";
import { PropertiesPanel } from "@/components/properties/PropertiesPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { PresentationMode } from "@/components/presentation/PresentationMode";
import { SlideList } from "@/components/slides/SlideList";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { SlideTypePicker } from "@/components/slides/SlideTypePicker";
import { SlidePropertiesPanel } from "@/components/slides/SlidePropertiesPanel";
import { StaticSlideFooter } from "@/components/slides/StaticSlideFooter";
import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";
import { createSlide } from "@/utils/slideFactory";
import type { SlideType } from "@/types/slide";

export function Editor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const sourceUrlsRef = useRef<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const {
    selectedId, removeDrawing, undo, redo, setTool, currentTime,
    slides, selectedSlideId, addSlide, updateSlide,
  } = useEditorStore();
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const isVideoSlide = selectedSlide?.content.kind === "video";
  const source = selectedSlide?.content.kind === "video" ? selectedSlide.content.sourceUrl ?? null : null;
  const filename = selectedSlide?.content.kind === "video" ? selectedSlide.content.fileName : "";

  useEffect(() => {
    const sourceUrls = sourceUrlsRef.current;
    return () => sourceUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || presenting || pickerOpen) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (!isVideoSlide) return;
      if (event.code === "Space") { event.preventDefault(); playerRef.current?.toggle(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); playerRef.current?.seekBy(-1); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); playerRef.current?.seekBy(1); return; }
      if (event.key === ",") { event.preventDefault(); playerRef.current?.frameBy(-1); return; }
      if (event.key === ".") { event.preventDefault(); playerRef.current?.frameBy(1); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); removeDrawing(selectedId); return; }
      if (event.key === "Escape") { setTool("select"); return; }
      const matched = TOOLS.find((tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase());
      if (matched) setTool(matched.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isVideoSlide, pickerOpen, presenting, redo, removeDrawing, selectedId, setTool, undo]);

  const openFile = (file?: File) => {
    if (!file || !selectedSlide || selectedSlide.content.kind !== "video") return;
    const url = URL.createObjectURL(file);
    sourceUrlsRef.current.add(url);
    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, fileName: file.name, sourceUrl: url, startTime: 0, endTime: undefined } });
  };

  const addNewSlide = (type: SlideType) => {
    addSlide(createSlide(type, slides.length));
    setPickerOpen(false);
  };

  const captureAsImageSlide = () => {
    const imageDataUrl = playerRef.current?.captureFrame();
    if (!imageDataUrl || !selectedSlide || selectedSlide.content.kind !== "video") return;
    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, thumbnail: imageDataUrl } });
    const imageSlide = createSlide("image", slides.length);
    imageSlide.name = `Frame · ${selectedSlide.name}`;
    imageSlide.question = selectedSlide.question;
    if (imageSlide.content.kind === "image") imageSlide.content.imageDataUrl = imageDataUrl;
    addSlide(imageSlide);
  };

  return (
    <main className="app-shell presentation-builder">
      <input ref={inputRef} className="sr-only" type="file" accept="video/*" onChange={(event) => { openFile(event.target.files?.[0]); event.target.value = ""; }} />
      <TopBar filename={filename} isVideoSlide={isVideoSlide} onOpen={() => inputRef.current?.click()} onAddSlide={() => setPickerOpen(true)} onPreview={() => setPresenting(true)} onCapture={captureAsImageSlide} />
      <div className="presentation-workspace">
        <SlideList onAdd={() => setPickerOpen(true)} />
        {selectedSlide ? (
          selectedSlide.content.kind === "video" ? (
            <div className="editor-grid video-slide-editor">
              <ToolRail />
              <VideoPlayer
                ref={playerRef}
                source={source}
                clipStart={selectedSlide.content.startTime}
                clipEnd={selectedSlide.content.endTime}
                onChooseVideo={() => inputRef.current?.click()}
                onDurationReady={(videoDuration) => {
                  if (selectedSlide.content.kind === "video" && selectedSlide.content.endTime === undefined) {
                    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, endTime: videoDuration } });
                  }
                }}
              />
              <PropertiesPanel />
            </div>
          ) : (
            <div className="static-editor-grid">
              <SlideRenderer slide={selectedSlide} onContentChange={(content) => updateSlide(selectedSlide.id, { content })} />
              <SlidePropertiesPanel />
            </div>
          )
        ) : <div className="no-slide-workspace"><button onClick={() => setPickerOpen(true)}>+ Add Slide</button><span>Crie o primeiro slide da apresentação.</span></div>}
      </div>
      {isVideoSlide ? <Timeline /> : <StaticSlideFooter />}
      {pickerOpen && <SlideTypePicker onSelect={addNewSlide} onClose={() => setPickerOpen(false)} />}
      {presenting && <PresentationMode onClose={() => setPresenting(false)} />}
    </main>
  );
}
