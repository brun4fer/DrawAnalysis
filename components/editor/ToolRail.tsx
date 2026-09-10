"use client";

import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";

export function ToolRail() {
  const { tool, setTool } = useEditorStore();
  const hint = tool === "polygon"
    ? "Clique nos pontos · Enter fecha"
    : tool === "triangle"
      ? "Clique em 3 pontos"
      : tool === "freeDraw"
        ? "Pressione e desenhe"
        : tool === "select"
          ? "Arraste para editar"
          : tool === "text"
            ? "Clique para inserir"
            : "Clique · mova · clique";
  return (
    <aside className="tool-rail" aria-label="Ferramentas de desenho">
      <div className="tool-section-label">TOOLS</div>
      {TOOLS.map(({ id, label, shortcut, icon: Icon }) => (
        <button key={id} className={`tool-button ${tool === id ? "active" : ""}`} onClick={() => setTool(id)} title={`${label} (${shortcut})`}>
          <Icon size={20} strokeWidth={1.8} />
          <span>{shortcut}</span>
        </button>
      ))}
      <div className="tool-hint">{hint}</div>
    </aside>
  );
}
