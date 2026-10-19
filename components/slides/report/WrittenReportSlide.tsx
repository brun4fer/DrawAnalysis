"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowUpRight, Eraser, MousePointer2, Pencil, SquareDashed, Undo2 } from "lucide-react";
import type { ReportDiagramMark, WrittenReportSlideContent } from "@/types/slide";
import type { Point } from "@/types/drawing";
import { createId } from "@/utils/id";
import { FootballPitch } from "../shared/FootballPitch";

interface Props {
  content: WrittenReportSlideContent;
  interactive?: boolean;
  onChange?: (content: WrittenReportSlideContent) => void;
}

type DiagramTool = "move" | ReportDiagramMark["type"];

const diagramTools: Array<{ id: DiagramTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "move", label: "Mover jogadores e bola", icon: MousePointer2 },
  { id: "arrow", label: "Desenhar seta", icon: ArrowUpRight },
  { id: "zone", label: "Marcar zona", icon: SquareDashed },
  { id: "free", label: "Desenho livre", icon: Pencil },
];

function pointFromPointer(event: React.PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function DiagramMark({ mark, markerId }: { mark: ReportDiagramMark; markerId: string }) {
  const points = mark.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
  if (mark.type === "zone") {
    const [start, end = start] = mark.points;
    return <rect x={Math.min(start.x, end.x) * 100} y={Math.min(start.y, end.y) * 100} width={Math.abs(end.x - start.x) * 100} height={Math.abs(end.y - start.y) * 100} rx="1" fill={`${mark.color}38`} stroke={mark.color} strokeWidth=".65" strokeDasharray="2 1.2" />;
  }
  if (mark.type === "arrow") return <polyline points={points} fill="none" stroke={mark.color} strokeWidth=".85" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${markerId})`} />;
  return <polyline points={points} fill="none" stroke={mark.color} strokeWidth=".7" strokeLinecap="round" strokeLinejoin="round" />;
}

export function WrittenReportSlide({ content, interactive = true, onChange }: Props) {
  const [tool, setTool] = useState<DiagramTool>("move");
  const [draft, setDraft] = useState<ReportDiagramMark | null>(null);
  const markerId = `report-arrow-${useId().replaceAll(":", "")}`;
  const marks = content.diagramMarks ?? [];
  const design = content.layoutDesign ?? "light-right";
  const title = content.title ?? content.moment ?? "ESQUEMA TÁTICO";
  const subtitle = content.subtitle ?? content.submoment ?? "DESCRIÇÃO";
  const accentColor = content.accentColor ?? "#f04b2f";
  const style = {
    "--report-field-width": `${Math.round((content.fieldRatio ?? .55) * 100)}%`,
    "--report-panel-color": content.panelColor ?? (design === "dark-right" ? "#10161a" : "#ffffff"),
    "--report-panel-opacity": content.panelOpacity ?? 1,
    "--report-text-color": content.textColor ?? (design === "dark-right" ? "#ffffff" : "#101010"),
    "--report-accent-color": accentColor,
    "--report-title-size": content.titleFontSize ?? 30,
    "--report-subtitle-size": content.subtitleFontSize ?? 14,
    "--report-body-size": content.bodyFontSize ?? 21,
  } as CSSProperties;

  const beginDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || tool === "move") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromPointer(event);
    setDraft({ id: createId(), type: tool, points: tool === "free" ? [point] : [point, point], color: accentColor });
  };

  const continueDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromPointer(event);
    setDraft((current) => current ? { ...current, points: current.type === "free" ? [...current.points, point] : [current.points[0], point] } : null);
  };

  const finishDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const start = draft.points[0];
    const end = draft.points.at(-1) ?? start;
    if (draft.points.length > 1 && Math.hypot(end.x - start.x, end.y - start.y) > .012) {
      onChange?.({ ...content, diagramMarks: [...marks, draft] });
    }
    setDraft(null);
  };

  return (
    <article className={`written-report-slide report-design-${design}`} data-slide-root style={style}>
      <div className="scheme-description-layout">
        <section className="scheme-description-field" aria-label="Esquema tático">
          <div className="report-pitch-canvas">
            <FootballPitch
              players={content.players}
              homeColor={content.teamColor}
              goalkeeperColor={content.goalkeeperColor}
              awayColor={content.awayColor ?? "#112d91"}
              homeTextColor={content.homeTextColor ?? "#101010"}
              awayTextColor={content.awayTextColor ?? "#ffffff"}
              pitchColor={content.pitchColor ?? "#4f78a5"}
              lineColor={content.pitchLineColor ?? "#ffffff"}
              playerSize={content.playerSize ?? .82}
              labelMode="name"
              ballPosition={content.ballPosition ?? { x: .5, y: .5 }}
              showBall={content.showBall ?? true}
              interactive={interactive && tool === "move"}
              onSelectPlayer={(selectedPlayerId) => onChange?.({ ...content, selectedPlayerId })}
              onMove={(id, position) => onChange?.({ ...content, selectedPlayerId: id, players: content.players.map((player) => player.id === id ? { ...player, position } : player) })}
              onMoveBall={(ballPosition) => onChange?.({ ...content, ballPosition })}
            />
            <svg
              className={`report-diagram-layer tool-${tool}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onPointerDown={beginDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={finishDrawing}
              onPointerCancel={() => setDraft(null)}
            >
              <defs><marker id={markerId} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill={accentColor} /></marker></defs>
              {marks.map((mark) => <DiagramMark key={mark.id} mark={mark} markerId={markerId} />)}
              {draft && <DiagramMark mark={draft} markerId={markerId} />}
            </svg>
            {interactive && <div className="report-diagram-toolbar">{diagramTools.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={tool === id ? "active" : ""} onClick={() => setTool(id)} title={label}><Icon size={13} /></button>)}<i /><button type="button" onClick={() => onChange?.({ ...content, diagramMarks: marks.slice(0, -1) })} disabled={!marks.length} title="Anular último desenho"><Undo2 size={13} /></button><button type="button" onClick={() => onChange?.({ ...content, diagramMarks: [] })} disabled={!marks.length} title="Limpar desenhos"><Eraser size={13} /></button></div>}
          </div>
        </section>

        <aside className="scheme-description-panel">
          <div className="scheme-description-copy">
            {subtitle.trim() && <span>{subtitle}</span>}
            {title.trim() && <h1>{title}</h1>}
            <i aria-hidden="true" />
            <p>{content.description || "Adicione aqui a descrição do esquema tático."}</p>
          </div>
        </aside>
      </div>
    </article>
  );
}
