"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { AnalysisSlide } from "@/types/slide";
import { isPresentationData, prepareSlidesForStorage } from "@/utils/presentationData";

interface ProjectSummary { id: string; name: string; version: number; updatedAt: string }
interface ProjectRecord extends ProjectSummary { data: unknown }
interface Props {
  slides: AnalysisSlide[];
  onClose: () => void;
  onOpen: (project: { id: string; name: string; slides: AnalysisSlide[] }) => void;
}

export function ProjectLibraryModal({ slides, onClose, onOpen }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects");
      const result = await response.json() as { projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os projetos.");
      setProjects(result.projects ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar os projetos.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), data: { slides: prepareSlidesForStorage(slides) } }) });
      const result = await response.json() as { project?: ProjectRecord; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error || "Não foi possível criar o projeto.");
      onOpen({ id: result.project.id, name: result.project.name, slides });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o projeto.");
      setBusy(false);
    }
  }

  async function open(project: ProjectSummary) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`);
      const result = await response.json() as { project?: ProjectRecord; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error || "Não foi possível abrir o projeto.");
      if (!isPresentationData(result.project.data)) throw new Error("Este projeto não contém uma apresentação válida.");
      onOpen({ id: result.project.id, name: result.project.name, slides: result.project.data.slides });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir o projeto.");
      setBusy(false);
    }
  }

  async function remove(project: ProjectSummary) {
    if (!window.confirm(`Eliminar o projeto “${project.name}”?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível eliminar o projeto.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível eliminar o projeto.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Projetos">
      <section className="project-modal">
        <header><div><span>WORKSPACE</span><h2>Apresentações guardadas</h2><p>Os projetos apresentados pertencem apenas à conta autenticada.</p></div><button onClick={onClose}><X size={19} /></button></header>
        <div className="project-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da apresentação atual" maxLength={100} /><button onClick={() => void create()} disabled={busy || !name.trim()}><Plus size={14} /> Guardar como novo</button></div>
        {error && <div className="modal-error">{error}</div>}
        <div className="project-list-head"><strong>Projetos</strong><button onClick={() => void load()} disabled={busy}><RefreshCw size={13} /> Atualizar</button></div>
        <div className="project-list">
          {busy && !projects.length ? <div className="modal-empty">A carregar projetos…</div> : projects.length ? projects.map((project) => (
            <div className="project-row" key={project.id}>
              <button className="project-open" onClick={() => void open(project)} disabled={busy}><i><FolderOpen size={17} /></i><span><strong>{project.name}</strong><small>Atualizado em {new Date(project.updatedAt).toLocaleString("pt-PT")} · v{project.version}</small></span></button>
              <button className="project-delete" onClick={() => void remove(project)} disabled={busy} title="Eliminar"><Trash2 size={15} /></button>
            </div>
          )) : <div className="modal-empty">Ainda não existem apresentações guardadas neste workspace.</div>}
        </div>
        <footer>Os vídeos e imagens locais não são enviados. Para reabrir vídeos noutro dispositivo, escolha-os na biblioteca cloud.</footer>
      </section>
    </div>
  );
}
