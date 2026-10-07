"use client";

import { Star, X } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";

export function ToolRail() {
  const { tool, setTool, favorites, activeFavoriteId, activateFavorite, removeFavorite } = useEditorStore();
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
            : tool === "identifyPlayer"
              ? "Clique no jogador · guardar identidade"
              : tool === "playerRing"
                ? "Clique no jogador · deteção automática"
                : tool === "ghost"
                  ? "Clique no jogador · indique a nova posição"
                  : tool === "spotlight"
                ? "Clique no jogador · ajuste automático"
                : tool === "longBallArrow"
                  ? "Clique na origem · clique no destino"
                  : tool === "zoom"
                    ? "Clique na zona a ampliar"
                    : tool === "glimpse"
                      ? "Clique nos olhos · indique a direção"
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
      <div className="favorite-tools-section">
        <div className="favorite-tools-title"><Star size={10} /> FAVORITOS</div>
        {favorites.length ? favorites.map((favorite) => {
          const definition = TOOLS.find((item) => item.id === favorite.type);
          const Icon = definition?.icon ?? Star;
          return (
            <div className="favorite-tool-slot" key={favorite.id}>
              <button
                className={`favorite-tool-button${activeFavoriteId === favorite.id ? " active" : ""}`}
                onClick={() => activateFavorite(favorite.id)}
                title={`${favorite.name} · usar preset`}
              >
                <Icon size={16} />
                <i style={{ background: favorite.style.stroke }} />
              </button>
              <button className="favorite-tool-remove" onClick={() => removeFavorite(favorite.id)} title="Remover dos favoritos"><X size={9} /></button>
            </div>
          );
        }) : <span className="favorite-tools-empty">Guarde um desenho nas propriedades.</span>}
      </div>
      <div className="tool-hint">{hint}</div>
    </aside>
  );
}
