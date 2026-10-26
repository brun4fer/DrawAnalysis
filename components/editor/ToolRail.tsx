"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Star, X } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";

export function ToolRail() {
  const { tool, setTool, favorites, activeFavoriteId, activateFavorite, renameFavorite, moveFavorite, removeFavorite } = useEditorStore();
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
  const [favoriteName, setFavoriteName] = useState("");
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
                ? "Pause e clique nos pés do jogador"
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
  const finishRename = (favoriteId: string) => {
    if (favoriteName.trim()) renameFavorite(favoriteId, favoriteName);
    setEditingFavoriteId(null);
    setFavoriteName("");
  };
  return (
    <div className="tool-sidebar">
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
      <aside className="favorite-rail" aria-label="Favoritos de desenho">
        <div className="favorite-tools-title"><Star size={11} /> FAVORITOS</div>
        <p>Atalhos com o seu estilo</p>
        <div className="favorite-tools-list">
          {favorites.length ? favorites.map((favorite, index) => {
            const definition = TOOLS.find((item) => item.id === favorite.type);
            const Icon = definition?.icon ?? Star;
            const isEditing = editingFavoriteId === favorite.id;
            return (
              <div className={`favorite-tool-row${activeFavoriteId === favorite.id ? " active" : ""}`} key={favorite.id}>
                {isEditing ? (
                  <form onSubmit={(event) => { event.preventDefault(); finishRename(favorite.id); }}>
                    <input
                      autoFocus
                      maxLength={48}
                      value={favoriteName}
                      onChange={(event) => setFavoriteName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setEditingFavoriteId(null);
                          setFavoriteName("");
                        }
                      }}
                      aria-label="Nome do favorito"
                    />
                    <button type="submit" title="Guardar nome"><Check size={12} /></button>
                  </form>
                ) : (
                  <button className="favorite-tool-button" onClick={() => activateFavorite(favorite.id)} title={`Usar ${favorite.name}`}>
                    <span className="favorite-tool-icon"><Icon size={15} /><i style={{ background: favorite.style.stroke }} /></span>
                    <span>{favorite.name}</span>
                  </button>
                )}
                <div className="favorite-tool-actions">
                  <button disabled={index === 0} onClick={() => moveFavorite(favorite.id, -1)} title="Subir favorito"><ChevronUp size={11} /></button>
                  <button disabled={index === favorites.length - 1} onClick={() => moveFavorite(favorite.id, 1)} title="Descer favorito"><ChevronDown size={11} /></button>
                  <button onClick={() => { setEditingFavoriteId(favorite.id); setFavoriteName(favorite.name); }} title="Mudar nome"><Pencil size={10} /></button>
                  <button className="favorite-tool-remove" onClick={() => removeFavorite(favorite.id)} title="Remover dos favoritos"><X size={11} /></button>
                </div>
              </div>
            );
          }) : <span className="favorite-tools-empty">Guarde uma figura nas propriedades para a ter sempre aqui.</span>}
        </div>
      </aside>
    </div>
  );
}
