"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowUpRight, Eraser, MousePointer2, Pencil, SquareDashed, Type, Undo2 } from "lucide-react";
import type { ReportDiagramMark, WrittenReportSlideContent } from "@/types/slide";
import type { Point } from "@/types/drawing";
import { createId } from "@/utils/id";
import { hexToRgba } from "@/utils/color";
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
  { id: "text", label: "Adicionar texto", icon: Type },
];

interface MarkDrag {
  mark: ReportDiagramMark;
  start: Point;
  pointIndex?: number;
  preview: ReportDiagramMark;
}

function pointFromClient(element: SVGSVGElement, clientX: number, clientY: number): Point {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
  };
}

function pointFromPointer(event: React.PointerEvent<SVGSVGElement>): Point {
  return pointFromClient(event.currentTarget, event.clientX, event.clientY);
}

function draggedMarkAt(drag: MarkDrag, point: Point): ReportDiagramMark {
  if (drag.pointIndex !== undefined) {
    return { ...drag.mark, points: drag.mark.points.map((candidate, index) => index === drag.pointIndex ? point : candidate) };
  }
  const minimumX = Math.min(...drag.mark.points.map((candidate) => candidate.x));
  const maximumX = Math.max(...drag.mark.points.map((candidate) => candidate.x));
  const minimumY = Math.min(...drag.mark.points.map((candidate) => candidate.y));
  const maximumY = Math.max(...drag.mark.points.map((candidate) => candidate.y));
  const deltaX = Math.max(-minimumX, Math.min(1 - maximumX, point.x - drag.start.x));
  const deltaY = Math.max(-minimumY, Math.min(1 - maximumY, point.y - drag.start.y));
  return { ...drag.mark, points: drag.mark.points.map((candidate) => ({ x: candidate.x + deltaX, y: candidate.y + deltaY })) };
}

function DiagramMark({ mark, markerId, editable = false, selected = false, onMove, onMovePoint }: {
  mark: ReportDiagramMark;
  markerId: string;
  editable?: boolean;
  selected?: boolean;
  onMove?: (event: React.PointerEvent<SVGGElement>) => void;
  onMovePoint?: (event: React.PointerEvent<SVGCircleElement>, pointIndex: number) => void;
}) {
  const convertedPoints = mark.points.map((point) => ({ x: point.x * 100, y: point.y * 100 }));
  const start = convertedPoints[0] ?? { x: 0, y: 0 };
  const end = convertedPoints.at(-1) ?? start;
  const opacity = Math.max(0, Math.min(1, mark.opacity ?? 1));
  const strokeWidth = mark.strokeWidth ?? (mark.type === "arrow" ? .85 : mark.type === "zone" ? .65 : .7);
  const dash = (mark.dashed ?? mark.type === "zone") ? "2 1.2" : undefined;
  let shape: React.ReactNode;
  if (mark.type === "zone") {
    shape = <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx="1" fill={hexToRgba(mark.fillColor ?? mark.color, .22)} stroke={mark.color} strokeWidth={strokeWidth} strokeDasharray={dash} opacity={opacity} vectorEffect="non-scaling-stroke" />;
  } else if (mark.type === "text") {
    shape = <text x={start.x} y={start.y} fill={mark.color} opacity={opacity} fontSize={mark.fontSize ?? 3.5} fontWeight="800" paintOrder="stroke" stroke="#00000080" strokeWidth=".32">{mark.text || "TEXTO"}</text>;
  } else {
    const points = convertedPoints.map((point) => `${point.x},${point.y}`).join(" ");
    shape = <polyline points={points} fill="none" stroke={mark.color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} opacity={opacity} markerEnd={mark.type === "arrow" ? `url(#${markerId})` : undefined} vectorEffect="non-scaling-stroke" />;
  }
  const textWidth = mark.type === "text" ? Math.max(5, (mark.text?.length ?? 5) * (mark.fontSize ?? 3.5) * .62) : 0;
  const minimumX = Math.min(...convertedPoints.map((point) => point.x));
  const maximumX = Math.max(...convertedPoints.map((point) => point.x), start.x + textWidth);
  const minimumY = Math.min(...convertedPoints.map((point) => point.y)) - (mark.type === "text" ? (mark.fontSize ?? 3.5) : 0);
  const maximumY = Math.max(...convertedPoints.map((point) => point.y));
  const editablePointIndices = mark.type === "arrow" || mark.type === "zone" ? [0, Math.max(0, mark.points.length - 1)] : [];
  return (
    <g className={`report-diagram-mark${editable ? " is-editable" : ""}${selected ? " selected" : ""}`} onPointerDown={editable ? onMove : undefined}>
      {shape}
      {selected && <>
        <rect className="report-mark-selection" x={minimumX - 1} y={minimumY - 1} width={Math.max(2, maximumX - minimumX + 2)} height={Math.max(2, maximumY - minimumY + 2)} fill="none" vectorEffect="non-scaling-stroke" />
        {editablePointIndices.map((pointIndex) => {
          const point = convertedPoints[pointIndex];
          return <circle key={pointIndex} className="report-mark-handle" cx={point.x} cy={point.y} r=".85" vectorEffect="non-scaling-stroke" onPointerDown={(event) => onMovePoint?.(event, pointIndex)} />;
        })}
      </>}
    </g>
  );
}

export function WrittenReportSlide({ content, interactive = true, onChange }: Props) {
  const [tool, setTool] = useState<DiagramTool>("move");
  const [draft, setDraft] = useState<ReportDiagramMark | null>(null);
  const [markDrag, setMarkDrag] = useState<MarkDrag | null>(null);
  const markerPrefix = `report-arrow-${useId().replaceAll(":", "")}`;
  const marks = content.diagramMarks ?? [];
  const draggedMarks = markDrag ? marks.map((mark) => mark.id === markDrag.mark.id ? markDrag.preview : mark) : marks;
  const visibleMarks = draft ? [...draggedMarks, draft] : draggedMarks;
  const design = content.layoutDesign === "light-left" ? "light-right" : content.layoutDesign ?? "light-right";
  const title = content.title ?? content.moment ?? "ESQUEMA TÁTICO";
  const subtitle = content.subtitle ?? content.submoment ?? "DESCRIÇÃO";
  const accentColor = content.accentColor ?? "#f04b2f";
  const style = {
    "--report-field-width": `${Math.round((content.fieldRatio ?? .55) * 100)}%`,
    "--report-panel-color": content.panelColor ?? (design === "dark-right" ? "#10161a" : "#ffffff"),
    "--report-panel-opacity": content.panelOpacity ?? 1,
    "--report-text-color": content.textColor ?? (design === "dark-right" ? "#ffffff" : "#101010"),
    "--report-accent-color": accentColor,
    "--report-title-size": content.titleFontSize ?? 44,
    "--report-subtitle-size": content.subtitleFontSize ?? 14,
    "--report-body-size": content.bodyFontSize ?? 21,
  } as CSSProperties;

  const updateMarks = (diagramMarks: ReportDiagramMark[], selectedDiagramMarkId = content.selectedDiagramMarkId) => {
    onChange?.({ ...content, diagramMarks, selectedDiagramMarkId });
  };

  const beginMarkDrag = (event: React.PointerEvent<SVGGElement | SVGCircleElement>, mark: ReportDiagramMark, pointIndex?: number) => {
    if (!interactive || tool !== "move") return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = pointFromClient(svg, event.clientX, event.clientY);
    onChange?.({ ...content, selectedDiagramMarkId: mark.id });
    setMarkDrag({ mark, start, pointIndex, preview: mark });
  };

  const beginDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || tool === "move") return;
    event.preventDefault();
    const point = pointFromPointer(event);
    if (tool === "text") {
      const text = window.prompt("Texto a adicionar ao campo", "TEXTO")?.trim();
      if (!text) return;
      const mark: ReportDiagramMark = { id: createId(), type: "text", points: [point], color: accentColor, opacity: 1, text, fontSize: 3.5 };
      updateMarks([...marks, mark], mark.id);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({
      id: createId(),
      type: tool,
      points: tool === "free" ? [point] : [point, point],
      color: accentColor,
      fillColor: accentColor,
      strokeWidth: tool === "arrow" ? .85 : tool === "zone" ? .65 : .7,
      opacity: 1,
      dashed: tool === "zone",
    });
  };

  const continueDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (markDrag) {
      const point = pointFromPointer(event);
      setMarkDrag((current) => current ? { ...current, preview: draggedMarkAt(current, point) } : null);
      return;
    }
    if (!draft || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromPointer(event);
    setDraft((current) => current ? { ...current, points: current.type === "free" ? [...current.points, point] : [current.points[0], point] } : null);
  };

  const finishDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (markDrag) {
      const movedMark = draggedMarkAt(markDrag, pointFromPointer(event));
      updateMarks(marks.map((mark) => mark.id === movedMark.id ? movedMark : mark), movedMark.id);
      setMarkDrag(null);
      return;
    }
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const start = draft.points[0];
    const end = draft.points.at(-1) ?? start;
    if (draft.points.length > 1 && Math.hypot(end.x - start.x, end.y - start.y) > .012) {
      updateMarks([...marks, draft], draft.id);
    }
    setDraft(null);
  };

  return (
    <article className={`written-report-slide report-design-${design}`} data-slide-root style={style}>
      <div className="scheme-description-layout">
        <section className="scheme-description-field" aria-label="Esquema tático">
          <header className="scheme-description-heading">
            {title.trim() && <h1>{title}</h1>}
            {subtitle.trim() && <span>{subtitle}</span>}
          </header>
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
              lineWidth={content.pitchLineWidth ?? 4}
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
              onPointerCancel={() => { setDraft(null); setMarkDrag(null); }}
            >
              <defs>{visibleMarks.filter((mark) => mark.type === "arrow").map((mark) => <marker key={mark.id} id={`${markerPrefix}-${mark.id}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill={mark.color} opacity={mark.opacity ?? 1} /></marker>)}</defs>
              {visibleMarks.map((mark) => <DiagramMark
                key={mark.id}
                mark={mark}
                markerId={`${markerPrefix}-${mark.id}`}
                editable={interactive && tool === "move" && draft?.id !== mark.id}
                selected={interactive && content.selectedDiagramMarkId === mark.id}
                onMove={(event) => beginMarkDrag(event, mark)}
                onMovePoint={(event, pointIndex) => beginMarkDrag(event, mark, pointIndex)}
              />)}
            </svg>
            {interactive && <div className="report-diagram-toolbar">{diagramTools.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={tool === id ? "active" : ""} onClick={() => { setTool(id); setDraft(null); setMarkDrag(null); }} title={label}><Icon size={13} /></button>)}<i /><button type="button" onClick={() => { const nextMarks = marks.slice(0, -1); updateMarks(nextMarks, nextMarks.some((mark) => mark.id === content.selectedDiagramMarkId) ? content.selectedDiagramMarkId : undefined); }} disabled={!marks.length} title="Anular último desenho"><Undo2 size={13} /></button><button type="button" onClick={() => updateMarks([], undefined)} disabled={!marks.length} title="Limpar desenhos"><Eraser size={13} /></button></div>}
          </div>
        </section>

        <aside className="scheme-description-panel">
          <div className="scheme-description-copy">
            <i aria-hidden="true" />
            <p>{content.description || "Adicione aqui a descrição do esquema tático."}</p>
          </div>
        </aside>
      </div>
    </article>
  );
}
