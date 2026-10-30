"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, MousePointer2, Pencil, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import type { PlayerSegmentationMask, Point } from "@/types/drawing";
import { displayedPointToFrame, paintStoredMaskOnCanvas } from "@/utils/playerManualMask";

type EditorMode = "lasso" | "polygon" | "brush";
type PaintOperation = "add" | "remove";

interface Props {
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  initialMask?: PlayerSegmentationMask;
  initialName: string;
  onCancel: () => void;
  onConfirm: (maskCanvas: HTMLCanvasElement, name: string) => void;
}

const HISTORY_LIMIT = 12;

function pointAtEvent(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, frameWidth: number, frameHeight: number): Point {
  return displayedPointToFrame(
    { x: event.clientX, y: event.clientY },
    canvas.getBoundingClientRect(),
    frameWidth,
    frameHeight,
  );
}

function captureAlpha(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray();
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3];
  return alpha;
}

function restoreAlpha(canvas: HTMLCanvasElement, alpha: Uint8ClampedArray) {
  const context = canvas.getContext("2d");
  if (!context || alpha.length !== canvas.width * canvas.height) return;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let index = 0; index < alpha.length; index += 1) {
    image.data[index * 4] = 255;
    image.data[index * 4 + 1] = 255;
    image.data[index * 4 + 2] = 255;
    image.data[index * 4 + 3] = alpha[index];
  }
  context.putImageData(image, 0, 0);
}

function applyPolygon(canvas: HTMLCanvasElement, points: Point[], operation: PaintOperation) {
  if (points.length < 3) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.save();
  context.globalCompositeOperation = operation === "remove" ? "destination-out" : "source-over";
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.fill();
  context.restore();
}

function paintBrush(canvas: HTMLCanvasElement, from: Point, to: Point, size: number, operation: PaintOperation) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.save();
  context.globalCompositeOperation = operation === "remove" ? "destination-out" : "source-over";
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  if (size <= 1) {
    const distance = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
    for (let step = 0; step <= distance; step += 1) {
      const progress = step / distance;
      context.fillRect(Math.round(from.x + (to.x - from.x) * progress), Math.round(from.y + (to.y - from.y) * progress), 1, 1);
    }
  } else {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = size;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}

export function ManualPlayerMaskEditor({ width, height, frameWidth, frameHeight, initialMask, initialName, onCancel, onConfirm }: Props) {
  const visibleCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<Uint8ClampedArray[]>([]);
  const futureRef = useRef<Uint8ClampedArray[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [mode, setMode] = useState<EditorMode>("lasso");
  const [operation, setOperation] = useState<PaintOperation>("add");
  const [brushSize, setBrushSize] = useState(6);
  const [path, setPath] = useState<Point[]>([]);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState(initialName);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });

  const refreshHistoryAvailability = useCallback(() => {
    setHistoryAvailability({ canUndo: historyRef.current.length > 0, canRedo: futureRef.current.length > 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    maskCanvasRef.current = canvas;
    const initialise = async () => {
      if (initialMask) await paintStoredMaskOnCanvas(initialMask, canvas);
      if (cancelled) return;
      historyRef.current = [];
      futureRef.current = [];
      setHistoryAvailability({ canUndo: false, canRedo: false });
      setReady(true);
      setRevision((value) => value + 1);
    };
    void initialise().catch(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [frameHeight, frameWidth, initialMask]);

  useEffect(() => {
    const visible = visibleCanvasRef.current;
    const mask = maskCanvasRef.current;
    const context = visible?.getContext("2d");
    if (!visible || !mask || !context) return;
    context.clearRect(0, 0, visible.width, visible.height);
    context.save();
    context.drawImage(mask, 0, 0, visible.width, visible.height);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = "rgba(163,255,18,.48)";
    context.fillRect(0, 0, visible.width, visible.height);
    context.restore();
    if (path.length) {
      context.save();
      context.strokeStyle = operation === "remove" ? "#ff5c69" : "#dfffac";
      context.fillStyle = operation === "remove" ? "#ff5c69" : "#a3ff12";
      context.lineWidth = 1.5;
      context.setLineDash(mode === "polygon" ? [6, 4] : []);
      context.beginPath();
      context.moveTo(path[0].x / frameWidth * visible.width, path[0].y / frameHeight * visible.height);
      path.slice(1).forEach((point) => context.lineTo(point.x / frameWidth * visible.width, point.y / frameHeight * visible.height));
      context.stroke();
      if (mode === "polygon") path.forEach((point) => {
        context.beginPath();
        context.arc(point.x / frameWidth * visible.width, point.y / frameHeight * visible.height, 3, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    }
  }, [frameHeight, frameWidth, height, mode, operation, path, revision, width]);

  const checkpoint = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    historyRef.current = [...historyRef.current, captureAlpha(mask)].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    refreshHistoryAvailability();
  }, [refreshHistoryAvailability]);

  const undo = useCallback(() => {
    const mask = maskCanvasRef.current;
    const previous = historyRef.current.at(-1);
    if (!mask || !previous) return;
    futureRef.current = [captureAlpha(mask), ...futureRef.current].slice(0, HISTORY_LIMIT);
    historyRef.current = historyRef.current.slice(0, -1);
    restoreAlpha(mask, previous);
    setPath([]);
    setRevision((value) => value + 1);
    refreshHistoryAvailability();
  }, [refreshHistoryAvailability]);

  const redo = useCallback(() => {
    const mask = maskCanvasRef.current;
    const next = futureRef.current[0];
    if (!mask || !next) return;
    historyRef.current = [...historyRef.current, captureAlpha(mask)].slice(-HISTORY_LIMIT);
    futureRef.current = futureRef.current.slice(1);
    restoreAlpha(mask, next);
    setPath([]);
    setRevision((value) => value + 1);
    refreshHistoryAvailability();
  }, [refreshHistoryAvailability]);

  const commitPolygon = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask || path.length < 3) return;
    checkpoint();
    applyPolygon(mask, path, operation);
    setPath([]);
    setRevision((value) => value + 1);
  }, [checkpoint, operation, path]);

  const confirmEditor = () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    if (mode === "polygon" && path.length >= 3) applyPolygon(mask, path, operation);
    onConfirm(mask, name.trim() || initialName);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && mode === "polygon" && path.length >= 3) {
        event.preventDefault();
        commitPolygon();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (path.length) setPath([]);
        else onCancel();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commitPolygon, mode, onCancel, path.length, redo, undo]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    const point = pointAtEvent(event, event.currentTarget, frameWidth, frameHeight);
    if (mode === "polygon") {
      setPath((current) => [...current, point]);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;
    checkpoint();
    if (mode === "brush" && maskCanvasRef.current) {
      paintBrush(maskCanvasRef.current, point, point, brushSize, operation);
      setRevision((value) => value + 1);
    } else {
      setPath([point]);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pointAtEvent(event, event.currentTarget, frameWidth, frameHeight);
    if (mode === "brush" && maskCanvasRef.current && lastPointRef.current) {
      paintBrush(maskCanvasRef.current, lastPointRef.current, point, brushSize, operation);
      setRevision((value) => value + 1);
    } else {
      setPath((current) => [...current, point]);
    }
    lastPointRef.current = point;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (mode === "lasso" && maskCanvasRef.current) {
      applyPolygon(maskCanvasRef.current, path, operation);
      setPath([]);
      setRevision((value) => value + 1);
    }
  };

  return (
    <div className="manual-player-mask-editor" aria-label="Editor manual da máscara do jogador">
      <canvas
        ref={visibleCanvasRef}
        width={width}
        height={height}
        className="manual-player-mask-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => { if (mode === "polygon") commitPolygon(); }}
      />
      <div className="manual-mask-toolbar" onPointerDown={(event) => event.stopPropagation()}>
        <div className="manual-mask-title">
          <strong>IDENTIFICAR JOGADOR</strong>
          <small>Contorne a silhueta · pode adicionar partes separadas e remover o espaço entre as pernas</small>
        </div>
        <label className="manual-mask-name">
          <span>Nome</span>
          <input value={name} maxLength={42} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="manual-mask-button-group">
          <button type="button" className={mode === "lasso" ? "active" : ""} onClick={() => { setMode("lasso"); setPath([]); }} title="Laço livre"><MousePointer2 size={14} /> Laço</button>
          <button type="button" className={mode === "polygon" ? "active" : ""} onClick={() => { setMode("polygon"); setPath([]); }} title="Polígono por pontos"><Pencil size={14} /> Polígono</button>
          <button type="button" className={mode === "brush" ? "active" : ""} onClick={() => { setMode("brush"); setPath([]); }} title="Pincel de precisão"><Pencil size={14} /> Pincel</button>
        </div>
        <div className="manual-mask-button-group">
          <button type="button" className={operation === "add" ? "active add" : ""} onClick={() => setOperation("add")}><Pencil size={14} /> Adicionar</button>
          <button type="button" className={operation === "remove" ? "active remove" : ""} onClick={() => setOperation("remove")}><Eraser size={14} /> Remover</button>
        </div>
        {mode === "brush" && (
          <label className="manual-mask-brush">
            <span>Pincel <b>{brushSize}px</b></span>
            <input type="range" min={1} max={48} step={1} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
          </label>
        )}
        {mode === "polygon" && path.length >= 3 && (
          <button type="button" className="manual-mask-close-polygon" onClick={commitPolygon}><Check size={14} /> Fechar polígono</button>
        )}
        <div className="manual-mask-button-group compact">
          <button type="button" disabled={!historyAvailability.canUndo} onClick={undo} title="Desfazer"><Undo2 size={14} /></button>
          <button type="button" disabled={!historyAvailability.canRedo} onClick={redo} title="Refazer"><Redo2 size={14} /></button>
          <button type="button" onClick={() => { checkpoint(); maskCanvasRef.current?.getContext("2d")?.clearRect(0, 0, frameWidth, frameHeight); setPath([]); setRevision((value) => value + 1); }} title="Limpar máscara"><RotateCcw size={14} /></button>
        </div>
        <div className="manual-mask-actions">
          <button type="button" onClick={onCancel}><X size={14} /> Cancelar</button>
          <button type="button" className="primary" disabled={!ready} onClick={confirmEditor}><Check size={14} /> Guardar máscara</button>
        </div>
      </div>
    </div>
  );
}
