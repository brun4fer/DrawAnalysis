"use client";

import { useId, useState } from "react";
import { ArrowUpRight, Circle, Eraser, Minus, MousePointer2, Pencil, Square, SquareDashed, Type, Undo2 } from "lucide-react";
import type { Point } from "@/types/drawing";
import type { BoardSlideContent, SlidePlayer, TacticalBoardMark, TacticalBoardMarkType, TacticalMovement } from "@/types/slide";
import { hexToRgba } from "@/utils/color";
import { createId } from "@/utils/id";
import { FootballPitch } from "../shared/FootballPitch";

interface Props {
  content: BoardSlideContent;
  interactive?: boolean;
  onChange?: (content: BoardSlideContent) => void;
  presentationTime?: number;
}

type BoardTool = "move" | TacticalBoardMarkType;

const FIELD_HEIGHT = 56.25;
const tools: Array<{ id: BoardTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "move", label: "Mover jogadores e bola", icon: MousePointer2 },
  { id: "arrow", label: "Seta", icon: ArrowUpRight },
  { id: "line", label: "Linha", icon: Minus },
  { id: "circle", label: "Círculo", icon: Circle },
  { id: "rectangle", label: "Retângulo", icon: Square },
  { id: "zone", label: "Zona", icon: SquareDashed },
  { id: "free", label: "Desenho livre", icon: Pencil },
  { id: "text", label: "Texto", icon: Type },
];

interface BoardState {
  positions: Record<string, Point>;
  ballPosition: Point;
  marks: TacticalBoardMark[];
  marksOpacity: number;
  name: string;
}

function pointFromPointer(event: React.PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function stateSequence(content: BoardSlideContent): BoardState[] {
  const initialPositions = Object.fromEntries(content.players.map((player) => [player.id, player.position]));
  const initial: BoardState = {
    positions: initialPositions,
    ballPosition: content.ballPosition ?? { x: .5, y: .5 },
    marks: content.tacticalMarks ?? [],
    marksOpacity: 1,
    name: "Formação inicial",
  };
  return (content.movements ?? []).reduce<BoardState[]>((states, movement) => {
    const previous = states.at(-1) ?? initial;
    states.push({
      positions: { ...previous.positions, ...movement.playerPositions },
      ballPosition: movement.ballPosition ?? previous.ballPosition,
      marks: movement.marks ?? previous.marks,
      marksOpacity: 1,
      name: movement.name,
    });
    return states;
  }, [initial]);
}

function editorState(content: BoardSlideContent): BoardState {
  const states = stateSequence(content);
  const movementIndex = (content.movements ?? []).findIndex((movement) => movement.id === content.activeMovementId);
  return states[Math.max(0, movementIndex + 1)] ?? states[0];
}

function playbackState(content: BoardSlideContent, time: number): BoardState {
  const states = stateSequence(content);
  if (states.length === 1) return states[0];
  const hold = Math.max(0, content.movementHoldDuration ?? .65);
  const travel = Math.max(.15, content.movementDuration ?? 1.2);
  if (time <= hold) return states[0];
  const stepLength = travel + hold;
  const elapsed = Math.max(0, time - hold);
  const movementIndex = Math.min(states.length - 2, Math.floor(elapsed / stepLength));
  const localTime = elapsed - movementIndex * stepLength;
  const previous = states[movementIndex];
  const target = states[movementIndex + 1];
  if (localTime >= travel || movementIndex >= states.length - 1) return target;
  const linear = Math.max(0, Math.min(1, localTime / travel));
  const progress = linear * linear * (3 - 2 * linear);
  const positions = Object.fromEntries(Object.keys({ ...previous.positions, ...target.positions }).map((playerId) => {
    const start = previous.positions[playerId] ?? target.positions[playerId];
    const end = target.positions[playerId] ?? start;
    return [playerId, { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress }];
  }));
  return {
    positions,
    ballPosition: {
      x: previous.ballPosition.x + (target.ballPosition.x - previous.ballPosition.x) * progress,
      y: previous.ballPosition.y + (target.ballPosition.y - previous.ballPosition.y) * progress,
    },
    marks: target.marks,
    marksOpacity: Math.min(1, linear * 1.8),
    name: target.name,
  };
}

function svgPoint(point: Point) {
  return { x: point.x * 100, y: point.y * FIELD_HEIGHT };
}

function BoardMark({ mark, markerPrefix, revealOpacity = 1 }: { mark: TacticalBoardMark; markerPrefix: string; revealOpacity?: number }) {
  const start = svgPoint(mark.points[0] ?? { x: 0, y: 0 });
  const end = svgPoint(mark.points.at(-1) ?? mark.points[0] ?? { x: 0, y: 0 });
  const opacity = Math.max(0, Math.min(1, mark.opacity * revealOpacity));
  const common = {
    stroke: mark.color,
    strokeWidth: Math.max(1, mark.strokeWidth),
    strokeDasharray: mark.dashed ? "10 7" : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    opacity,
  };
  if (mark.type === "circle") {
    return <ellipse cx={start.x} cy={start.y} rx={Math.abs(end.x - start.x)} ry={Math.abs(end.y - start.y)} fill={hexToRgba(mark.fillColor, opacity * .24)} {...common} />;
  }
  if (mark.type === "rectangle" || mark.type === "zone") {
    return <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx={mark.type === "zone" ? 1.4 : .25} fill={hexToRgba(mark.fillColor, opacity * (mark.type === "zone" ? .24 : .14))} {...common} strokeDasharray={mark.type === "zone" ? "10 7" : common.strokeDasharray} />;
  }
  if (mark.type === "text") {
    return <text x={start.x} y={start.y} fill={mark.color} opacity={opacity} fontSize={Math.max(2, mark.strokeWidth * .58)} fontWeight="800" paintOrder="stroke" stroke="#00000080" strokeWidth=".35">{mark.text || "TEXTO"}</text>;
  }
  const points = mark.points.map((point) => { const value = svgPoint(point); return `${value.x},${value.y}`; }).join(" ");
  if (mark.type === "free") return <polyline points={points} fill="none" {...common} />;
  return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} fill="none" markerEnd={mark.type === "arrow" ? `url(#${markerPrefix}-${mark.id})` : undefined} {...common} />;
}

function movementWithPatch(movements: TacticalMovement[], id: string, patch: Partial<TacticalMovement>) {
  return movements.map((movement) => movement.id === id ? { ...movement, ...patch } : movement);
}

export function TacticalBoardSlide({ content, interactive = true, onChange, presentationTime }: Props) {
  const [tool, setTool] = useState<BoardTool>("move");
  const [draft, setDraft] = useState<TacticalBoardMark | null>(null);
  const markerPrefix = `tactical-arrow-${useId().replaceAll(":", "")}`;
  const movements = content.movements ?? [];
  const activeMovement = movements.find((movement) => movement.id === content.activeMovementId);
  const state = presentationTime === undefined
    ? (interactive ? editorState(content) : playbackState(content, 0))
    : playbackState(content, presentationTime);
  const players: SlidePlayer[] = content.players.map((player) => ({ ...player, position: state.positions[player.id] ?? player.position }));
  const visibleMarks = draft ? [...state.marks, draft] : state.marks;

  const updateMarks = (marks: TacticalBoardMark[]) => {
    if (activeMovement) {
      onChange?.({ ...content, movements: movementWithPatch(movements, activeMovement.id, { marks }) });
      return;
    }
    onChange?.({ ...content, tacticalMarks: marks });
  };

  const updatePlayerPosition = (playerId: string, position: Point) => {
    if (activeMovement) {
      onChange?.({
        ...content,
        selectedPlayerId: playerId,
        movements: movementWithPatch(movements, activeMovement.id, { playerPositions: { ...activeMovement.playerPositions, [playerId]: position } }),
      });
      return;
    }
    onChange?.({ ...content, selectedPlayerId: playerId, players: content.players.map((player) => player.id === playerId ? { ...player, position } : player) });
  };

  const updateBallPosition = (ballPosition: Point) => {
    if (activeMovement) {
      onChange?.({ ...content, movements: movementWithPatch(movements, activeMovement.id, { ballPosition }) });
      return;
    }
    onChange?.({ ...content, ballPosition });
  };

  const beginDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || tool === "move") return;
    event.preventDefault();
    const point = pointFromPointer(event);
    if (tool === "text") {
      const text = window.prompt("Texto a adicionar ao quadro", "TEXTO")?.trim();
      if (!text) return;
      updateMarks([...state.marks, {
        id: createId(), type: "text", points: [point], text,
        color: content.markColor ?? "#fff23d", fillColor: content.markFillColor ?? "#fff23d",
        strokeWidth: content.markStrokeWidth ?? 5, opacity: content.markOpacity ?? 1, dashed: false,
      }]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({
      id: createId(), type: tool, points: tool === "free" ? [point] : [point, point],
      color: content.markColor ?? "#fff23d", fillColor: content.markFillColor ?? "#fff23d",
      strokeWidth: content.markStrokeWidth ?? 5, opacity: content.markOpacity ?? 1, dashed: content.markDashed ?? false,
    });
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
    if (draft.points.length > 1 && Math.hypot(end.x - start.x, end.y - start.y) > .008) updateMarks([...state.marks, draft]);
    setDraft(null);
  };

  return (
    <article className="tactical-board-slide" data-slide-root>
      <div className="tactical-board-canvas">
        <FootballPitch
          players={players}
          homeColor={content.homeColor}
          awayColor={content.awayColor}
          homeTextColor={content.homeTextColor}
          awayTextColor={content.awayTextColor}
          pitchColor={content.pitchColor}
          lineColor={content.pitchLineColor}
          playerSize={content.playerSize}
          labelMode="name"
          ballPosition={state.ballPosition}
          showBall={content.showBall ?? true}
          interactive={interactive && tool === "move"}
          onSelectPlayer={(playerId) => onChange?.({ ...content, selectedPlayerId: playerId })}
          onMove={updatePlayerPosition}
          onMoveBall={updateBallPosition}
        />

        <svg
          className={`tactical-board-marks tool-${tool}`}
          viewBox={`0 0 100 ${FIELD_HEIGHT}`}
          preserveAspectRatio="none"
          onPointerDown={beginDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={() => setDraft(null)}
        >
          <defs>{visibleMarks.filter((mark) => mark.type === "arrow").map((mark) => <marker key={mark.id} id={`${markerPrefix}-${mark.id}`} markerWidth="3.2" markerHeight="3.2" refX="2.8" refY="1.6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L3.2,1.6 L0,3.2 Z" fill={mark.color} opacity={mark.opacity} /></marker>)}</defs>
          {visibleMarks.map((mark) => <BoardMark key={mark.id} mark={mark} markerPrefix={markerPrefix} revealOpacity={draft?.id === mark.id ? 1 : state.marksOpacity} />)}
        </svg>

        {interactive && (
          <div className="tactical-board-toolbar">
            {tools.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={tool === id ? "active" : ""} onClick={() => { setTool(id); setDraft(null); }} title={label}><Icon size={14} /></button>)}
            <i />
            <button type="button" onClick={() => updateMarks(state.marks.slice(0, -1))} disabled={!state.marks.length} title="Anular último objeto"><Undo2 size={14} /></button>
            <button type="button" onClick={() => updateMarks([])} disabled={!state.marks.length} title="Limpar objetos desta etapa"><Eraser size={14} /></button>
          </div>
        )}

        {interactive && <div className="tactical-movement-badge"><span>{activeMovement ? "MOVIMENTO" : "INÍCIO"}</span><strong>{state.name}</strong></div>}
      </div>
    </article>
  );
}
