"use client";

import { useEffect, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/VideoPlayer";
import { PropertiesPanel } from "@/components/properties/PropertiesPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";

export function Editor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [source, setSource] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const { selectedId, removeDrawing, undo, redo, setTool } = useEditorStore();

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
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
  }, [redo, removeDrawing, selectedId, setTool, undo]);

  const openFile = (file?: File) => {
    if (!file) return;
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setFilename(file.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <main className="app-shell">
      <input ref={inputRef} className="sr-only" type="file" accept="video/*" onChange={(e) => openFile(e.target.files?.[0])} />
      <TopBar filename={filename} onOpen={() => inputRef.current?.click()} />
      <div className="editor-grid">
        <ToolRail />
        <VideoPlayer ref={playerRef} source={source} onChooseVideo={() => inputRef.current?.click()} />
        <PropertiesPanel />
      </div>
      <Timeline />
    </main>
  );
}
