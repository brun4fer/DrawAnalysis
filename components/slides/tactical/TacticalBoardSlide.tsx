"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, Circle, Eraser, Link2, Minus, MousePointer2, Pencil, Pentagon, Square, SquareDashed, Type, Undo2, X } from "lucide-react";
import type { Point } from "@/types/drawing";
import type { BoardSlideContent, SlidePlayer, TacticalBoardMark, TacticalBoardMarkType, TacticalMovement } from "@/types/slide";
import { hexToRgba } from "@/utils/color";
import { createId } from "@/utils/id";
import { FootballPitch } from "../shared/FootballPitch";
import { APP_PRODUCT, isWrittenReportProduct } from "@/lib/product";
import { isPlayerLinkedMark, resolveTacticalMarkTransition, resolvedTacticalMark } from "@/utils/tacticalBoard";

interface Props {
  content: BoardSlideContent;
  interactive?: boolean;
  onChange?: (content: BoardSlideContent) => void;
  presentationTime?: number;
}

type BoardTool = "move" | TacticalBoardMarkType;

const FIELD_HEIGHT = 56.25;
const baseTools: Array<{ id: BoardTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "move", label: "Mover jogadores e bola", icon: MousePointer2 },
  { id: "arrow", label: "Seta", icon: ArrowUpRight },
  { id: "line", label: "Linha", icon: Minus },
  { id: "circle", label: "Círculo", icon: Circle },
  { id: "rectangle", label: "Retângulo", icon: Square },
  { id: "free", label: "Desenho livre", icon: Pencil },
  { id: "text", label: "Texto", icon: Type },
  { id: "player-link", label: "Ligar jogadores", icon: Link2 },
  { id: "player-polygon", label: "Polígono ligado a jogadores", icon: Pentagon },
];

const trainingTools: Array<{ id: BoardTool; label: string; icon: typeof MousePointer2 }> = [
  { id: "cone", label: "Cone de treino", icon: SquareDashed },
  { id: "flat-ladder", label: "Escada plana", icon: Minus },
];

const tools = isWrittenReportProduct(APP_PRODUCT.variant) ? [...baseTools, ...trainingTools] : baseTools;

interface BoardState {
  positions: Record<string, Point>;
  ballPosition: Point;
  marks: TacticalBoardMark[];
  markOpacities: Record<string, number>;
  markReveals: Record<string, number>;
  name: string;
}

interface MarkDrag {
  mark: TacticalBoardMark;
  start: Point;
  pointIndex?: number;
  preview: TacticalBoardMark;
}

interface PendingText {
  point: Point;
  value: string;
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

function draggedMarkAt(drag: MarkDrag, point: Point): TacticalBoardMark {
  if (drag.pointIndex !== undefined) {
    return {
      ...drag.mark,
      points: drag.mark.points.map((candidate, index) => index === drag.pointIndex ? point : candidate),
    };
  }
  const minimumX = Math.min(...drag.mark.points.map((candidate) => candidate.x));
  const maximumX = Math.max(...drag.mark.points.map((candidate) => candidate.x));
  const minimumY = Math.min(...drag.mark.points.map((candidate) => candidate.y));
  const maximumY = Math.max(...drag.mark.points.map((candidate) => candidate.y));
  const deltaX = Math.max(-minimumX, Math.min(1 - maximumX, point.x - drag.start.x));
  const deltaY = Math.max(-minimumY, Math.min(1 - maximumY, point.y - drag.start.y));
  return {
    ...drag.mark,
    points: drag.mark.points.map((candidate) => ({ x: candidate.x + deltaX, y: candidate.y + deltaY })),
  };
}

function stateSequence(content: BoardSlideContent): BoardState[] {
  const initialPositions = Object.fromEntries(content.players.map((player) => [player.id, player.position]));
  const initial: BoardState = {
    positions: initialPositions,
    ballPosition: content.ballPosition ?? { x: .5, y: .5 },
    marks: content.tacticalMarks ?? [],
    markOpacities: Object.fromEntries((content.tacticalMarks ?? []).map((mark) => [mark.id, 1])),
    markReveals: Object.fromEntries((content.tacticalMarks ?? []).map((mark) => [mark.id, 1])),
    name: "Formação inicial",
  };
  return (content.movements ?? []).reduce<BoardState[]>((states, movement) => {
    const previous = states.at(-1) ?? initial;
    states.push({
      positions: { ...previous.positions, ...movement.playerPositions },
      ballPosition: movement.ballPosition ?? previous.ballPosition,
      marks: movement.marks ?? previous.marks,
      markOpacities: Object.fromEntries((movement.marks ?? previous.marks).map((mark) => [mark.id, 1])),
      markReveals: Object.fromEntries((movement.marks ?? previous.marks).map((mark) => [mark.id, 1])),
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
  if (movementIndex >= states.length - 1) return target;
  const linear = Math.max(0, Math.min(1, localTime / travel));
  const progress = linear * linear * (3 - 2 * linear);
  const positions = Object.fromEntries(Object.keys({ ...previous.positions, ...target.positions }).map((playerId) => {
    const start = previous.positions[playerId] ?? target.positions[playerId];
    const end = target.positions[playerId] ?? start;
    return [playerId, { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress }];
  }));
  // A tactical step is always presented in two deliberate passes: first the
  // player/ball movement, then the new drawings. That makes the right/left
  // navigation predictable and avoids revealing an explanation before the
  // movement it belongs to has been seen.
  const drawingProgress = localTime < travel
    ? 0
    : hold <= 0 ? 1 : Math.max(0, Math.min(1, (localTime - travel) / hold));
  const markTransition = resolveTacticalMarkTransition(
    previous.marks,
    target.marks,
    drawingProgress,
    true,
    linear,
  );
  return {
    positions,
    ballPosition: {
      x: previous.ballPosition.x + (target.ballPosition.x - previous.ballPosition.x) * progress,
      y: previous.ballPosition.y + (target.ballPosition.y - previous.ballPosition.y) * progress,
    },
    marks: markTransition.marks,
    markOpacities: markTransition.opacities,
    markReveals: markTransition.reveals,
    name: target.name,
  };
}

function svgPoint(point: Point) {
  return { x: point.x * 100, y: point.y * FIELD_HEIGHT };
}

function BoardMark({ mark, markerPrefix, revealOpacity = 1, revealProgress = 1, editable = false, selected = false, onMove, onMovePoint, onSelect }: {
  mark: TacticalBoardMark;
  markerPrefix: string;
  revealOpacity?: number;
  revealProgress?: number;
  editable?: boolean;
  selected?: boolean;
  onMove?: (event: React.PointerEvent<SVGGElement>) => void;
  onMovePoint?: (event: React.PointerEvent<SVGCircleElement>, pointIndex: number) => void;
  onSelect?: (event: React.PointerEvent<SVGGElement>) => void;
}) {
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
  // Equipment is much smaller than a zone or an arrow. Keep its outline legible
  // without allowing the general tactical-line width to cover the whole object.
  const equipmentStroke = { ...common, strokeWidth: Math.max(.45, Math.min(1.9, mark.strokeWidth * .16)) };
  let shape: React.ReactNode;
  if (mark.type === "cone") {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.max(3, Math.abs(end.x - start.x));
    const height = Math.max(1.5, Math.abs(end.y - start.y));
    const cx = x + width / 2;
    const cy = y + height / 2;
    const coneRed = mark.fillColor || "#f2382b";
    const coneEdge = mark.color || "#b61e1c";
    // A low disc cone, seen from above: broad red base, inset top ring and
    // curved highlights instead of the old upright triangular marker.
    shape = <g>
      <ellipse cx={cx} cy={cy + height * .06} rx={width * .5} ry={height * .43} fill={coneEdge} opacity={opacity} />
      <ellipse cx={cx} cy={cy} rx={width * .47} ry={height * .4} fill={coneRed} {...equipmentStroke} />
      <ellipse cx={cx} cy={cy - height * .09} rx={width * .2} ry={height * .13} fill="#8e171a" opacity={opacity * .86} />
      <ellipse cx={cx} cy={cy - height * .11} rx={width * .135} ry={height * .075} fill="#f88678" opacity={opacity * .78} />
      <path d={`M ${x + width * .11} ${cy + height * .08} Q ${cx} ${y + height * .18} ${x + width * .89} ${cy + height * .08}`} fill="none" stroke="#ff9d90" strokeWidth={equipmentStroke.strokeWidth} strokeLinecap="round" opacity={opacity * .7} />
    </g>;
  } else if (mark.type === "flat-ladder") {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.max(7, Math.abs(end.x - start.x));
    const height = Math.max(1.7, Math.abs(end.y - start.y));
    const rungs = Array.from({ length: 8 }, (_, index) => x + width * ((index + .5) / 8));
    const railY = [y + height * .13, y + height * .87];
    const rungRed = mark.fillColor || "#f03b20";
    shape = <g fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacity}>
      <path d={railY.map((rail) => `M ${x} ${rail} L ${x + width} ${rail}`).join(" ")} stroke="#11181d" strokeWidth={Math.max(.5, equipmentStroke.strokeWidth * 1.15)} />
      <path d={rungs.map((rung) => `M ${rung} ${railY[0]} L ${rung} ${railY[1]}`).join(" ")} stroke={rungRed} strokeWidth={Math.max(.55, equipmentStroke.strokeWidth * 1.35)} />
      <path d={`M ${x} ${railY[0]} L ${x} ${railY[1]} M ${x + width} ${railY[0]} L ${x + width} ${railY[1]}`} stroke="#11181d" strokeWidth={Math.max(.4, equipmentStroke.strokeWidth * .85)} />
    </g>;
  } else if (mark.type === "circle") {
    shape = <ellipse cx={start.x} cy={start.y} rx={Math.abs(end.x - start.x)} ry={Math.abs(end.y - start.y)} fill={hexToRgba(mark.fillColor, opacity * .24)} {...common} />;
  } else if (mark.type === "rectangle" || mark.type === "zone") {
    shape = <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx={mark.type === "zone" ? 1.4 : .25} fill={hexToRgba(mark.fillColor, opacity * (mark.type === "zone" ? .24 : .14))} {...common} strokeDasharray={mark.type === "zone" ? "10 7" : common.strokeDasharray} />;
  } else if (mark.type === "text") {
    shape = <text x={start.x} y={start.y} fill={mark.color} opacity={opacity} fontSize={Math.max(2, mark.strokeWidth * .58)} fontWeight="800" paintOrder="stroke" stroke="#00000080" strokeWidth=".35">{mark.text || "TEXTO"}</text>;
  } else if (mark.type === "player-polygon") {
    const points = mark.points.map((point) => { const value = svgPoint(point); return `${value.x},${value.y}`; }).join(" ");
    shape = <polygon points={points} fill={hexToRgba(mark.fillColor, opacity * .24)} {...common} />;
  } else if (mark.type === "player-link") {
    const points = mark.points.map((point) => { const value = svgPoint(point); return `${value.x},${value.y}`; }).join(" ");
    shape = <polyline points={points} fill="none" {...common} />;
  } else {
    const points = mark.points.map((point) => { const value = svgPoint(point); return `${value.x},${value.y}`; }).join(" ");
    shape = mark.type === "free"
      ? <polyline points={points} fill="none" {...common} />
      : (() => {
        const animatedEnd = mark.type === "arrow"
          ? { x: start.x + (end.x - start.x) * revealProgress, y: start.y + (end.y - start.y) * revealProgress }
          : end;
        return <line x1={start.x} y1={start.y} x2={animatedEnd.x} y2={animatedEnd.y} fill="none" markerEnd={mark.type === "arrow" && revealProgress >= .72 ? `url(#${markerPrefix}-${mark.id})` : undefined} {...common} />;
      })();
  }
  const convertedPoints = mark.points.map(svgPoint);
  const minimumX = Math.min(...convertedPoints.map((point) => point.x));
  const maximumX = Math.max(...convertedPoints.map((point) => point.x));
  const minimumY = Math.min(...convertedPoints.map((point) => point.y));
  const maximumY = Math.max(...convertedPoints.map((point) => point.y));
  const editablePointIndices = !isPlayerLinkedMark(mark) && (mark.type === "arrow" || mark.type === "line" || mark.type === "circle" || mark.type === "rectangle" || mark.type === "zone" || mark.type === "cone" || mark.type === "flat-ladder")
    ? [0, Math.max(0, mark.points.length - 1)]
    : [];
  return (
    <g className={`tactical-board-mark${editable || onSelect ? " is-editable" : ""}${selected ? " selected" : ""}`} onPointerDown={editable ? onMove : onSelect}>
      {shape}
      {selected && <>
        <rect className="tactical-mark-selection" x={minimumX - .8} y={minimumY - .8} width={Math.max(1.6, maximumX - minimumX + 1.6)} height={Math.max(1.6, maximumY - minimumY + 1.6)} fill="none" vectorEffect="non-scaling-stroke" />
        {editablePointIndices.map((pointIndex) => {
          const point = convertedPoints[pointIndex];
          return <circle key={pointIndex} className="tactical-mark-handle" cx={point.x} cy={point.y} r=".72" vectorEffect="non-scaling-stroke" onPointerDown={(event) => onMovePoint?.(event, pointIndex)} />;
        })}
      </>}
    </g>
  );
}

function movementWithPatch(movements: TacticalMovement[], id: string, patch: Partial<TacticalMovement>) {
  return movements.map((movement) => movement.id === id ? { ...movement, ...patch } : movement);
}

export function TacticalBoardSlide({ content, interactive = true, onChange, presentationTime }: Props) {
  const [tool, setTool] = useState<BoardTool>("move");
  const [draft, setDraft] = useState<TacticalBoardMark | null>(null);
  const [markDrag, setMarkDrag] = useState<MarkDrag | null>(null);
  const [linkedPlayerIds, setLinkedPlayerIds] = useState<string[]>([]);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const markerPrefix = `tactical-arrow-${useId().replaceAll(":", "")}`;
  const movements = content.movements ?? [];
  const activeMovement = movements.find((movement) => movement.id === content.activeMovementId);
  const state = presentationTime === undefined
    ? (interactive ? editorState(content) : playbackState(content, 0))
    : playbackState(content, presentationTime);
  const players: SlidePlayer[] = content.players
    .filter((player) => player.team === "home" ? content.showHomeTeam !== false : content.showAwayTeam !== false)
    .map((player) => ({ ...player, position: state.positions[player.id] ?? player.position }));
  const draggedMarks = markDrag
    ? state.marks.map((mark) => mark.id === markDrag.mark.id ? markDrag.preview : mark)
    : state.marks;
  const visibleMarks = draft ? [...draggedMarks, draft] : draggedMarks;
  const isLinkingPlayers = tool === "player-link" || tool === "player-polygon";
  const minimumLinkedPlayers = tool === "player-polygon" ? 3 : 2;

  useEffect(() => {
    if (pendingText) textInputRef.current?.focus();
  }, [pendingText]);

  const updateMarks = (marks: TacticalBoardMark[], selectedMarkId = content.selectedMarkId) => {
    if (activeMovement) {
      onChange?.({ ...content, selectedMarkId, movements: movementWithPatch(movements, activeMovement.id, { marks }) });
      return;
    }
    onChange?.({ ...content, selectedMarkId, tacticalMarks: marks });
  };

  const selectMark = (markId?: string) => onChange?.({ ...content, selectedMarkId: markId });

  const toggleLinkedPlayer = (playerId: string) => {
    if (!isLinkingPlayers) {
      onChange?.({ ...content, selectedPlayerId: playerId });
      return;
    }
    setLinkedPlayerIds((current) => current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId]);
  };

  const createPlayerLinkedMark = () => {
    if (!isLinkingPlayers || linkedPlayerIds.length < minimumLinkedPlayers) return;
    const points = linkedPlayerIds
      .map((playerId) => state.positions[playerId])
      .filter((point): point is Point => Boolean(point));
    if (points.length < minimumLinkedPlayers) return;
    const mark: TacticalBoardMark = {
      id: createId(),
      type: tool,
      playerIds: [...linkedPlayerIds],
      points,
      color: content.markColor ?? "#fff23d",
      fillColor: content.markFillColor ?? "#fff23d",
      strokeWidth: content.markStrokeWidth ?? 5,
      opacity: content.markOpacity ?? 1,
      dashed: content.markDashed ?? false,
    };
    updateMarks([...state.marks, mark], mark.id);
    setLinkedPlayerIds([]);
  };

  const beginMarkDrag = (event: React.PointerEvent<SVGGElement | SVGCircleElement>, mark: TacticalBoardMark, pointIndex?: number) => {
    if (!interactive || tool !== "move") return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = pointFromClient(svg, event.clientX, event.clientY);
    selectMark(mark.id);
    setMarkDrag({ mark, start, pointIndex, preview: mark });
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

  const addPendingText = () => {
    const text = pendingText?.value.trim();
    if (!pendingText || !text) return;
    const mark: TacticalBoardMark = {
      id: createId(), type: "text", points: [pendingText.point], text,
      color: content.markColor ?? "#fff23d", fillColor: content.markFillColor ?? "#fff23d",
      strokeWidth: content.markStrokeWidth ?? 5, opacity: content.markOpacity ?? 1, dashed: false,
    };
    updateMarks([...state.marks, mark], mark.id);
    setPendingText(null);
  };

  const beginDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || tool === "move" || isLinkingPlayers) return;
    event.preventDefault();
    const point = pointFromPointer(event);
    if (tool === "cone" || tool === "flat-ladder") {
      const mark: TacticalBoardMark = {
        id: createId(), type: tool,
        points: [point, { x: Math.min(1, point.x + (tool === "cone" ? .06 : .16)), y: Math.min(1, point.y + (tool === "cone" ? .035 : .045)) }],
        color: tool === "cone" ? "#b61e1c" : "#11181d", fillColor: tool === "cone" ? "#f2382b" : "#f03b20",
        strokeWidth: content.markStrokeWidth ?? 5, opacity: content.markOpacity ?? 1, dashed: false,
      };
      updateMarks([...state.marks, mark], mark.id);
      return;
    }
    if (tool === "text") {
      setPendingText({ point, value: "" });
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
      updateMarks(state.marks.map((mark) => mark.id === movedMark.id ? movedMark : mark), movedMark.id);
      setMarkDrag(null);
      return;
    }
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const start = draft.points[0];
    const end = draft.points.at(-1) ?? start;
    if (draft.points.length > 1 && Math.hypot(end.x - start.x, end.y - start.y) > .008) updateMarks([...state.marks, draft], draft.id);
    setDraft(null);
  };

  const marksOverlay = (
    <svg
      className={`tactical-board-marks tool-${tool}`}
      viewBox={`0 0 100 ${FIELD_HEIGHT}`}
      preserveAspectRatio="none"
      onPointerDown={beginDrawing}
      onPointerMove={continueDrawing}
      onPointerUp={finishDrawing}
      onPointerCancel={() => { setDraft(null); setMarkDrag(null); }}
    >
      <defs>{visibleMarks.filter((mark) => mark.type === "arrow").map((mark) => <marker key={mark.id} id={`${markerPrefix}-${mark.id}`} markerWidth="3.2" markerHeight="3.2" refX="2.8" refY="1.6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L3.2,1.6 L0,3.2 Z" fill={mark.color} opacity={mark.opacity} /></marker>)}</defs>
      {visibleMarks.map((mark) => {
        const resolvedMark = resolvedTacticalMark(mark, state.positions);
        const playerLinked = isPlayerLinkedMark(mark);
        return <BoardMark
          key={mark.id}
          mark={resolvedMark}
          markerPrefix={markerPrefix}
          revealOpacity={draft?.id === mark.id ? 1 : (state.markOpacities[mark.id] ?? 1)}
          revealProgress={draft?.id === mark.id ? 1 : (state.markReveals[mark.id] ?? 1)}
          editable={interactive && tool === "move" && !playerLinked && draft?.id !== mark.id}
          selected={interactive && content.selectedMarkId === mark.id}
          onMove={(event) => beginMarkDrag(event, mark)}
          onMovePoint={(event, pointIndex) => beginMarkDrag(event, mark, pointIndex)}
          onSelect={interactive && tool === "move" ? (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectMark(mark.id);
          } : undefined}
        />;
      })}
    </svg>
  );

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
          lineWidth={content.pitchLineWidth ?? 4}
          playerSize={content.playerSize}
          labelMode="name"
          ballPosition={state.ballPosition}
          showBall={content.showBall ?? true}
          overlay={marksOverlay}
          interactive={interactive && (tool === "move" || isLinkingPlayers)}
          selectionMode={isLinkingPlayers}
          selectedPlayerIds={isLinkingPlayers ? linkedPlayerIds : []}
          onSelectPlayer={toggleLinkedPlayer}
          onMove={updatePlayerPosition}
          onMoveBall={updateBallPosition}
        />

        {interactive && (
          <div className="tactical-board-toolbar">
            {tools.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={tool === id ? "active" : ""} onClick={() => { setTool(id); setDraft(null); setMarkDrag(null); setLinkedPlayerIds([]); setPendingText(null); }} title={label}><Icon size={14} /></button>)}
            <i />
            <button type="button" onClick={() => { const marks = state.marks.slice(0, -1); updateMarks(marks, marks.some((mark) => mark.id === content.selectedMarkId) ? content.selectedMarkId : undefined); }} disabled={!state.marks.length} title="Anular último objeto"><Undo2 size={14} /></button>
            <button type="button" onClick={() => updateMarks([], undefined)} disabled={!state.marks.length} title="Limpar objetos desta etapa"><Eraser size={14} /></button>
          </div>
        )}

        {interactive && isLinkingPlayers && <div className="tactical-link-builder">
          <span>{tool === "player-polygon" ? "Polígono" : "Ligação"}: {linkedPlayerIds.length}/{minimumLinkedPlayers} jogadores</span>
          <button type="button" onClick={createPlayerLinkedMark} disabled={linkedPlayerIds.length < minimumLinkedPlayers} title="Criar ligação"><Check size={13} /></button>
          <button type="button" onClick={() => setLinkedPlayerIds([])} disabled={!linkedPlayerIds.length} title="Limpar seleção"><X size={13} /></button>
        </div>}

        {interactive && pendingText && <form
          className="tactical-text-composer"
          style={{ left: `${pendingText.point.x * 100}%`, top: `${pendingText.point.y * 100}%` }}
          onSubmit={(event) => { event.preventDefault(); addPendingText(); }}
        >
          <input
            ref={textInputRef}
            value={pendingText.value}
            placeholder="Escreva o texto"
            onChange={(event) => setPendingText((current) => current ? { ...current, value: event.target.value } : current)}
            onKeyDown={(event) => { if (event.key === "Escape") setPendingText(null); }}
          />
          <button type="submit" disabled={!pendingText.value.trim()} title="Adicionar texto"><Check size={13} /></button>
          <button type="button" onClick={() => setPendingText(null)} title="Cancelar"><X size={13} /></button>
        </form>}

        {interactive && <div className="tactical-movement-badge"><span>{activeMovement ? "MOVIMENTO" : "INÍCIO"}</span><strong>{state.name}</strong></div>}
      </div>
    </article>
  );
}
