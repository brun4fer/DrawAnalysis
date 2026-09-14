"use client";

import { Camera, ChevronDown, FolderOpen, Images, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";

interface Props {
  filename: string;
  onOpen: () => void;
  onCapture: () => void;
  bottomTab: "timeline" | "slides";
  onBottomTab: (tab: "timeline" | "slides") => void;
}

export function TopBar({ filename, onOpen, onCapture, bottomTab, onBottomTab }: Props) {
  const { undo, redo, reset, history, future, slides } = useEditorStore();
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">T</span><span>Tacti<strong>Draw</strong></span></div>
      <div className="project-chip"><span className={`status-dot ${filename ? "ready" : ""}`} />{filename || "Novo projeto"}<ChevronDown size={13} /></div>
      <div className="workspace-tabs">
        <button className={bottomTab === "timeline" ? "active" : ""} onClick={() => onBottomTab("timeline")}>Timeline</button>
        <button className={bottomTab === "slides" ? "active" : ""} onClick={() => onBottomTab("slides")}><Images size={13} /> Slides {slides.length > 0 && <i>{slides.length}</i>}</button>
      </div>
      <div className="topbar-spacer" />
      <button className="topbar-action" onClick={undo} disabled={!history.length} title="Anular (Ctrl+Z)"><Undo2 size={17} /></button>
      <button className="topbar-action" onClick={redo} disabled={!future.length} title="Refazer (Ctrl+Y)"><Redo2 size={17} /></button>
      <button className="topbar-action" onClick={reset} title="Limpar desenhos"><RotateCcw size={16} /></button>
      <div className="topbar-divider" />
      <button className="capture-button" onClick={onCapture} disabled={!filename} title="Capturar frame e desenhos como slide"><Camera size={16} /> Criar slide</button>
      <button className="open-button" onClick={onOpen}><FolderOpen size={16} /> Abrir vídeo</button>
    </header>
  );
}
