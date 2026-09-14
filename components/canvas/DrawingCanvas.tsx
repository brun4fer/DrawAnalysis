"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useEditorStore } from "@/store/useEditorStore";
import type { DrawingData, DrawingObject, Point, Tool } from "@/types/drawing";
import { DEFAULT_STYLE, DEFAULT_TRANSFORM } from "@/types/drawing";
import { flattenPoints, toNormalized } from "@/utils/coordinates";
import { createId } from "@/utils/id";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { DrawingShape } from "./DrawingShape";

interface Props {
  width: number;
  height: number;
  registerCapture?: (capture: (() => HTMLCanvasElement | null) | null) => void;
}

interface Draft { tool: Tool; start: Point; points: Point[]; current: Point }

const labelFor = (kind: DrawingObject["type"]) => ({
  ellipse: "Marcador", arrow: "Seta", line: "Linha", triangle: "Triângulo",
  polygon: "Zona", rectangle: "Retângulo", text: "Texto", freeDraw: "Traço",
})[kind];

export function DrawingCanvas({ width, height, registerCapture }: Props) {
  const { tool, drawings, selectedId, currentTime, duration, addDrawing, updateDrawing, setSelectedId, setTool } = useEditorStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    const capture = () => {
      const stage = stageRef.current;
      if (!stage) return null;
      const selection = stage.find(".selection-transformer");
      selection.forEach((node) => node.hide());
      stage.draw();
      const canvas = stage.toCanvas({ pixelRatio: 1 });
      selection.forEach((node) => node.show());
      stage.draw();
      return canvas;
    };
    registerCapture?.(capture);
    return () => registerCapture?.(null);
  }, [registerCapture]);

  const pointFromStage = (stage: Konva.Stage): Point | null => {
    const pointer = stage.getPointerPosition();
    return pointer ? toNormalized(pointer, width, height) : null;
  };

  const makeDrawing = useCallback((type: DrawingObject["type"], data: DrawingData) => {
    const count = drawings.filter((item) => item.type === type).length + 1;
    const object: DrawingObject = {
      id: createId(),
      name: `${labelFor(type)} ${count}`,
      type,
      startTime: currentTime,
      endTime: Math.min(duration || currentTime + 3, currentTime + 3),
      trackingEnabled: false,
      keyframes: [],
      animation: { fadeIn: 0.12, fadeOut: 0.12 },
      style: { ...DEFAULT_STYLE, dash: [] },
      transform: { ...DEFAULT_TRANSFORM },
      data,
    };
    addDrawing(object);
    setDraft(null);
    setTool("select");
  }, [addDrawing, currentTime, drawings, duration, setTool]);

  const finishPolygon = useCallback(() => {
    if (draft?.tool !== "polygon") return;
    const points = draft.points.filter((point, index, all) => {
      if (index === 0) return true;
      const previous = all[index - 1];
      return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.003;
    });
    if (points.length >= 3) makeDrawing("polygon", { kind: "polygon", points });
  }, [draft, makeDrawing]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && tool === "polygon") finishPolygon();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishPolygon, tool]);

  const onPointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (event.target !== event.target.getStage()) return;
    const point = pointFromStage(event.target.getStage()!);
    if (!point) return;
    if (tool === "select") { setSelectedId(null); return; }
    if (tool === "text") {
      makeDrawing("text", { kind: "text", origin: point, text: "TEXTO", fontSize: 0.055 });
      return;
    }
    if (tool === "triangle" || tool === "polygon") {
      const existingPoints = draft?.tool === tool ? draft.points : [];
      const points = [...existingPoints, point];
      if (tool === "triangle" && points.length === 3) {
        makeDrawing("triangle", { kind: "triangle", points });
      } else {
        setDraft({ tool, start: points[0], points, current: point });
      }
      return;
    }

    if (["ellipse", "rectangle", "arrow", "line"].includes(tool) && draft?.tool === tool) {
      const dx = point.x - draft.start.x;
      const dy = point.y - draft.start.y;
      if (tool === "ellipse") makeDrawing("ellipse", {
        kind: "ellipse",
        center: { x: draft.start.x + dx / 2, y: draft.start.y + dy / 2 },
        radiusX: Math.max(0.01, Math.abs(dx / 2)),
        radiusY: Math.max(0.01, Math.abs(dy / 2)),
      });
      if (tool === "rectangle") makeDrawing("rectangle", {
        kind: "rectangle",
        origin: { x: Math.min(draft.start.x, point.x), y: Math.min(draft.start.y, point.y) },
        width: Math.max(0.01, Math.abs(dx)),
        height: Math.max(0.01, Math.abs(dy)),
      });
      if (tool === "arrow" || tool === "line") makeDrawing(tool, { kind: tool, points: [draft.start, point] });
      return;
    }
    setDraft({ tool, start: point, points: [point], current: point });
  };

  const onPointerMove = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (!draft || draft.tool !== tool || tool === "select" || tool === "text") return;
    const point = pointFromStage(event.target.getStage()!);
    if (!point) return;
    if (tool === "freeDraw") setDraft({ ...draft, points: [...draft.points, point], current: point });
    else setDraft({ ...draft, current: point });
  };

  const onPointerUp = () => {
    if (draft?.tool === "freeDraw" && tool === "freeDraw" && draft.points.length > 1) {
      makeDrawing("freeDraw", { kind: "freeDraw", points: draft.points });
    }
  };

  const preview = (() => {
    if (!draft || draft.tool !== tool) return null;
    const style = { stroke: DEFAULT_STYLE.stroke, strokeWidth: DEFAULT_STYLE.strokeWidth, dash: [7, 6], opacity: 0.9 };
    if (tool === "ellipse") return <Ellipse listening={false} {...style} x={(draft.start.x + draft.current.x) / 2 * width} y={(draft.start.y + draft.current.y) / 2 * height} radiusX={Math.abs(draft.current.x - draft.start.x) / 2 * width} radiusY={Math.abs(draft.current.y - draft.start.y) / 2 * height} />;
    if (tool === "rectangle") return <Rect listening={false} {...style} x={Math.min(draft.start.x, draft.current.x) * width} y={Math.min(draft.start.y, draft.current.y) * height} width={Math.abs(draft.current.x - draft.start.x) * width} height={Math.abs(draft.current.y - draft.start.y) * height} />;
    if (tool === "arrow") return <Arrow listening={false} {...style} fill={DEFAULT_STYLE.stroke} points={flattenPoints([draft.start, draft.current], width, height)} pointerLength={12} pointerWidth={12} />;
    if (tool === "line") return <Line listening={false} {...style} points={flattenPoints([draft.start, draft.current], width, height)} />;
    if (tool === "freeDraw") return <Line listening={false} {...style} points={flattenPoints(draft.points, width, height)} tension={0.35} />;
    if (tool === "triangle" || tool === "polygon") return <Line listening={false} {...style} points={flattenPoints([...draft.points, draft.current], width, height)} closed={tool === "triangle" && draft.points.length === 2} />;
    return null;
  })();

  const visible = drawings.filter((drawing) => getObjectStateAtTime(drawing, currentTime).visible);

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      className={`drawing-stage tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDblClick={finishPolygon}
      onDblTap={finishPolygon}
    >
      <Layer>
        {visible.map((object) => (
          <DrawingShape
            key={object.id}
            object={object}
            width={width}
            height={height}
            currentTime={currentTime}
            selected={selectedId === object.id}
            canEdit={tool === "select"}
            onSelect={() => { setSelectedId(object.id); setTool("select"); }}
            onChange={(patch) => updateDrawing(object.id, patch)}
          />
        ))}
        {preview}
        {draft && (tool === "polygon" || tool === "triangle") && draft.points.map((point, index) => (
          <Ellipse listening={false} key={index} x={point.x * width} y={point.y * height} radiusX={4} radiusY={4} fill="#fff" />
        ))}
        {tool === "text" && <Text text="Clique para adicionar texto" x={16} y={16} fill="#fff" opacity={0.5} fontSize={13} />}
      </Layer>
    </Stage>
  );
}
