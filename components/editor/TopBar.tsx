"use client";

import { Camera, Eye, FolderOpen, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";

interface Props {
  filename: string;
  isVideoSlide: boolean;
  onOpen: () => void;
  onAddSlide: () => void;
  onPreview: () => void;
  onCapture: () => void;
}

export function TopBar({ filename, isVideoSlide, onOpen, onAddSlide, onPreview, onCapture }: Props) {
  const { undo, redo, reset, history, future, slides } = useEditorStore();
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">T</span><span>Tacti<strong>Draw</strong></span></div>
      <div className="project-chip"><span className="status-dot ready" />Apresentação de análise · {slides.length} slides</div>
      <button className="add-slide-top" onClick={onAddSlide}><Plus size={15} /> Add Slide</button>
      <div className="topbar-spacer" />
      <button className="topbar-action" onClick={undo} disabled={!history.length} title="Anular (Ctrl+Z)"><Undo2 size={17} /></button>
      <button className="topbar-action" onClick={redo} disabled={!future.length} title="Refazer (Ctrl+Y)"><Redo2 size={17} /></button>
      {isVideoSlide && <button className="topbar-action" onClick={reset} title="Limpar desenhos"><RotateCcw size={16} /></button>}
      <div className="topbar-divider" />
      {isVideoSlide && <button className="capture-button" onClick={onCapture} disabled={!filename} title="Criar slide de imagem a partir deste frame"><Camera size={16} /> Capturar frame</button>}
      {isVideoSlide && <button className="open-button secondary-open" onClick={onOpen}><FolderOpen size={16} /> {filename ? "Trocar vídeo" : "Abrir vídeo"}</button>}
      <button className="preview-button" onClick={onPreview} disabled={!slides.length}><Eye size={16} /> Preview</button>
    </header>
  );
}
