"use client";

import { useId, useState } from "react";
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
  { id: "move", label: "Mover jogadores", icon: MousePointer2 },
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
  const points = mark.points.map((point) => `${point.x * 100},${point.y * 63.3}`).join(" ");
  if (mark.type === "zone") {
    const [start, end = start] = mark.points;
    return <rect x={Math.min(start.x, end.x) * 100} y={Math.min(start.y, end.y) * 63.3} width={Math.abs(end.x - start.x) * 100} height={Math.abs(end.y - start.y) * 63.3} rx="1" fill={`${mark.color}38`} stroke={mark.color} strokeWidth=".65" strokeDasharray="2 1.2" />;
  }
  if (mark.type === "arrow") return <polyline points={points} fill="none" stroke={mark.color} strokeWidth=".85" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${markerId})`} />;
  return <polyline points={points} fill="none" stroke={mark.color} strokeWidth=".7" strokeLinecap="round" strokeLinejoin="round" />;
}

export function WrittenReportSlide({ content, interactive = true, onChange }: Props) {
  const [tool, setTool] = useState<DiagramTool>("move");
  const [draft, setDraft] = useState<ReportDiagramMark | null>(null);
  const markerId = `report-arrow-${useId().replaceAll(":", "")}`;
  const marks = content.diagramMarks ?? [];

  const beginDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || tool === "move") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromPointer(event);
    setDraft({ id: createId(), type: tool, points: tool === "free" ? [point] : [point, point], color: "#a3ff12" });
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

  const visibleFields = (content.generalFields ?? []).filter((field) => field.label.trim() || field.value.trim());

  return (
    <article className="written-report-slide">
      <header className="report-header">
        <div><span>RELATÓRIO ESCRITO</span><h1>{content.team || "Equipa / adversário"}</h1></div>
        <dl><div><dt>JORNADA</dt><dd>{content.matchday || "—"}</dd></div><div><dt>DATA DO JOGO</dt><dd>{content.matchDate || "—"}</dd></div></dl>
      </header>

      <div className="report-layout">
        <aside className="report-sidebar">
          <section><h2>DADOS GERAIS</h2><ReportFact label="Estádio" value={content.stadium} /><ReportFact label="Dimensões" value={content.pitchDimensions} /><ReportFact label="Meteorologia" value={content.weather} /><ReportFact label="Treinador" value={content.coach} />{visibleFields.map((field) => <ReportFact key={field.id} label={field.label} value={field.value} />)}</section>
          <section className="report-systems"><h2>ESQUEMAS TÁTICOS</h2><div>{(content.tacticalSystems ?? []).map((system) => <span key={system} className={system === content.formation ? "active" : ""}>{system}</span>)}</div></section>
        </aside>

        <section className="report-main">
          <div className="report-moment-heading"><div><span>MOMENTO DO JOGO</span><h2>{content.moment || "Momento"}</h2></div><strong>{content.submoment || "Submomento"}</strong></div>
          <div className="report-pitch-wrap">
            <div className="report-pitch-canvas">
              <FootballPitch
                players={content.players}
                homeColor={content.teamColor}
                goalkeeperColor={content.goalkeeperColor}
                interactive={interactive && tool === "move"}
                onMove={(id, position) => onChange?.({ ...content, players: content.players.map((player) => player.id === id ? { ...player, position } : player) })}
              />
              <svg
                className={`report-diagram-layer tool-${tool}`}
                viewBox="0 0 100 63.3"
                preserveAspectRatio="none"
                onPointerDown={beginDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={finishDrawing}
                onPointerCancel={() => setDraft(null)}
              >
                <defs><marker id={markerId} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="#a3ff12" /></marker></defs>
                {marks.map((mark) => <DiagramMark key={mark.id} mark={mark} markerId={markerId} />)}
                {draft && <DiagramMark mark={draft} markerId={markerId} />}
              </svg>
              {interactive && <div className="report-diagram-toolbar">{diagramTools.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={tool === id ? "active" : ""} onClick={() => setTool(id)} title={label}><Icon size={13} /></button>)}<i /><button type="button" onClick={() => onChange?.({ ...content, diagramMarks: marks.slice(0, -1) })} disabled={!marks.length} title="Anular último desenho"><Undo2 size={13} /></button><button type="button" onClick={() => onChange?.({ ...content, diagramMarks: [] })} disabled={!marks.length} title="Limpar desenhos"><Eraser size={13} /></button></div>}
            </div>
          </div>
          <div className="report-description"><span>DESCRIÇÃO / COMPORTAMENTOS</span><p>{content.description || "Sem descrição."}</p></div>
        </section>
      </div>
    </article>
  );
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return <div className="report-fact"><span>{label || "Campo"}</span><strong>{value || "—"}</strong></div>;
}
