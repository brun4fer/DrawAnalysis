"use client";

import { Camera, Cloud, Eye, FolderOpen, LogOut, Plus, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";

interface Props {
  filename: string;
  isVideoSlide: boolean;
  onOpen: () => void;
  onAddSlide: () => void;
  onPreview: () => void;
  onCapture: () => void;
  onCloud: () => void;
  onProjects: () => void;
  onSave: () => void;
  onLogout: () => void;
  projectName: string;
  saveState: "idle" | "saving" | "saved" | "error";
  account?: { user: { name: string; username: string }; workspace: { name: string } } | null;
}

export function TopBar({ filename, isVideoSlide, onOpen, onAddSlide, onPreview, onCapture, onCloud, onProjects, onSave, onLogout, projectName, saveState, account }: Props) {
  const { undo, redo, reset, history, future, slides } = useEditorStore();
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark">T</span><span>Tacti<strong>Draw</strong></span></div>
      <button className="project-chip" onClick={onProjects} title="Abrir projetos"><span className="status-dot ready" />{projectName} · {slides.length} slides</button>
      <button className="add-slide-top" onClick={onAddSlide}><Plus size={15} /> Add Slide</button>
      <div className="topbar-spacer" />
      <button className="topbar-text-action" onClick={onProjects}><FolderOpen size={15} /> Projetos</button>
      <button className="topbar-text-action" onClick={onSave}><Save size={15} /> {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Guardado" : saveState === "error" ? "Erro" : "Guardar"}</button>
      <button className="topbar-action" onClick={undo} disabled={!history.length} title="Anular (Ctrl+Z)"><Undo2 size={17} /></button>
      <button className="topbar-action" onClick={redo} disabled={!future.length} title="Refazer (Ctrl+Y)"><Redo2 size={17} /></button>
      {isVideoSlide && <button className="topbar-action" onClick={reset} title="Limpar desenhos"><RotateCcw size={16} /></button>}
      <div className="topbar-divider" />
      {isVideoSlide && <button className="capture-button cloud-button" onClick={onCloud}><Cloud size={16} /> Cloud</button>}
      {isVideoSlide && <button className="capture-button" onClick={onCapture} disabled={!filename} title="Criar slide de imagem a partir deste frame"><Camera size={16} /> Capturar frame</button>}
      {isVideoSlide && <button className="open-button secondary-open" onClick={onOpen}><FolderOpen size={16} /> {filename ? "Trocar vídeo" : "Abrir vídeo"}</button>}
      <button className="preview-button" onClick={onPreview} disabled={!slides.length}><Eye size={16} /> Preview</button>
      {account && <div className="account-chip" title={`${account.user.name} · ${account.workspace.name}`}><span>{account.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{account.user.name}</strong><small>{account.workspace.name}</small></div></div>}
      <button className="topbar-action" onClick={onLogout} title="Terminar sessão"><LogOut size={16} /></button>
    </header>
  );
}
