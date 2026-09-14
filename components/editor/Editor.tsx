"use client";

import { useEffect, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/VideoPlayer";
import { PropertiesPanel } from "@/components/properties/PropertiesPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { SlidesPanel } from "@/components/presentation/SlidesPanel";
import { PresentationMode } from "@/components/presentation/PresentationMode";
import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";
import { createId } from "@/utils/id";

export function Editor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [source, setSource] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [bottomTab, setBottomTab] = useState<"timeline" | "slides">("timeline");
  const [presenting, setPresenting] = useState(false);
  const { selectedId, removeDrawing, undo, redo, setTool, currentTime, slides, addSlide } = useEditorStore();

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (presenting) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
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
  }, [presenting, redo, removeDrawing, selectedId, setTool, undo]);

  const openFile = (file?: File) => {
    if (!file) return;
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setFilename(file.name.replace(/\.[^.]+$/, ""));
  };

  const captureSlide = () => {
    const imageDataUrl = playerRef.current?.captureFrame();
    if (!imageDataUrl) return;
    addSlide({
      id: createId(),
      title: `Slide ${slides.length + 1}`,
      question: "",
      imageDataUrl,
      videoTime: currentTime,
      createdAt: Date.now(),
    });
    setBottomTab("slides");
  };

  return (
    <main className="app-shell">
      <input ref={inputRef} className="sr-only" type="file" accept="video/*" onChange={(e) => openFile(e.target.files?.[0])} />
      <TopBar
        filename={filename}
        onOpen={() => inputRef.current?.click()}
        onCapture={captureSlide}
        bottomTab={bottomTab}
        onBottomTab={setBottomTab}
      />
      <div className="editor-grid">
        <ToolRail />
        <VideoPlayer ref={playerRef} source={source} onChooseVideo={() => inputRef.current?.click()} />
        <PropertiesPanel />
      </div>
      {bottomTab === "timeline" ? <Timeline /> : <SlidesPanel onPresent={() => setPresenting(true)} />}
      {presenting && <PresentationMode onClose={() => setPresenting(false)} />}
    </main>
  );
}
