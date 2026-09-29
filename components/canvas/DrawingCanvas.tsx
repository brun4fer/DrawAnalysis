"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from "react-konva";
import { detectPlayers } from "@/lib/playerDetector";
import { useEditorStore } from "@/store/useEditorStore";
import type { DrawingData, DrawingObject, NormalizedBox, PlayerTrack, Point, Tool } from "@/types/drawing";
import { DEFAULT_STYLE, DEFAULT_TRANSFORM } from "@/types/drawing";
import { flattenPoints, toNormalized } from "@/utils/coordinates";
import { createId } from "@/utils/id";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { DrawingShape } from "./DrawingShape";

interface Props {
  width: number;
  height: number;
  registerCapture?: (capture: (() => HTMLCanvasElement | null) | null) => void;
  getVideoElement?: () => HTMLVideoElement | null;
}

interface Draft { tool: Tool; start: Point; points: Point[]; current: Point }
interface DetectionEffect { phase: "scanning" | "locked" | "failed"; click: Point; box?: NormalizedBox; score?: number }

const labelFor = (kind: DrawingObject["type"]) => ({
  playerRing: "Ring", spotlight: "Spotlight", ellipse: "Marcador", arrow: "Seta", line: "Linha", triangle: "Triângulo",
  polygon: "Zona", rectangle: "Retângulo", text: "Texto", freeDraw: "Traço",
})[kind];

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function containsPoint(box: NormalizedBox, point: Point) {
  const paddingX = Math.min(0.006, box.width * 0.12);
  const paddingY = Math.min(0.008, box.height * 0.08);
  return point.x >= box.x - paddingX
    && point.x <= box.x + box.width + paddingX
    && point.y >= box.y - paddingY
    && point.y <= box.y + box.height + paddingY;
}

function makeDetectionCrop(video: HTMLVideoElement, click: Point) {
  const cropWidth = video.videoWidth * .14;
  const cropHeight = video.videoHeight * .30;
  const sourceX = clamp(click.x * video.videoWidth - cropWidth / 2, 0, video.videoWidth - cropWidth);
  const sourceY = clamp(click.y * video.videoHeight - cropHeight / 2, 0, video.videoHeight - cropHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = Math.round(canvas.width * cropHeight / cropWidth);
  canvas.getContext("2d")?.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return { canvas, sourceX, sourceY, cropWidth, cropHeight };
}

function makeTrackingCrop(video: HTMLVideoElement, box: NormalizedBox) {
  const normalizedWidth = clamp(box.width * 5, .08, .26);
  const normalizedHeight = clamp(box.height * 2.6, .18, .42);
  const cropWidth = video.videoWidth * normalizedWidth;
  const cropHeight = video.videoHeight * normalizedHeight;
  const centerX = (box.x + box.width / 2) * video.videoWidth;
  const centerY = (box.y + box.height / 2) * video.videoHeight;
  const sourceX = clamp(centerX - cropWidth / 2, 0, video.videoWidth - cropWidth);
  const sourceY = clamp(centerY - cropHeight / 2, 0, video.videoHeight - cropHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = Math.round(canvas.width * cropHeight / cropWidth);
  canvas.getContext("2d")?.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return { canvas, sourceX, sourceY, cropWidth, cropHeight };
}

function sampleJerseyColor(source: HTMLVideoElement | HTMLCanvasElement, box: [number, number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 12;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  const [x, y, width, height] = box;
  try {
    context.drawImage(source, x + width * .25, y + height * .18, width * .5, height * .38, 0, 0, 12, 12);
    const pixels = context.getImageData(0, 0, 12, 12).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 128) continue;
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      count += 1;
    }
    return count ? [red / count, green / count, blue / count] as [number, number, number] : undefined;
  } catch {
    return undefined;
  }
}

function colorDistance(left: [number, number, number], right: [number, number, number]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) / 441.7;
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function DrawingCanvas({ width, height, registerCapture, getVideoElement }: Props) {
  const {
    tool, drawings, selectedId, currentTime, duration, isPlaying, slides, selectedSlideId,
    addDrawing, addPlayerTrack, appendPlayerTrackingSample, setPlayerTrackStatus,
    updateDrawing, setSelectedId, setTool,
  } = useEditorStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [detectionBoxes, setDetectionBoxes] = useState<NormalizedBox[]>([]);
  const [detectionEffect, setDetectionEffect] = useState<DetectionEffect | null>(null);
  const [detectingPlayer, setDetectingPlayer] = useState(false);
  const [trackingQuality, setTrackingQuality] = useState<"tracking" | "reacquiring" | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trackingBusyRef = useRef(false);
  const lastTrackingFrameRef = useRef<Record<string, number>>({});
  const trackingMissesRef = useRef<Record<string, number>>({});

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

  const makeDrawing = useCallback((
    type: DrawingObject["type"],
    data: DrawingData,
    options?: { target?: DrawingObject["target"]; trackingEnabled?: boolean },
  ) => {
    const count = drawings.filter((item) => item.type === type).length + 1;
    const effectStyle = type === "playerRing"
      ? { stroke: "#f7f8f2", fill: "#1454c4", strokeWidth: 5, shadowColor: "#f1e72b", shadowBlur: 26, shadowOpacity: .9 }
      : type === "spotlight"
        ? { stroke: "#fff8c7", fill: "#fff8c733", strokeWidth: 2, shadowColor: "#fff2a8", shadowBlur: 22, shadowOpacity: .6 }
        : {};
    const object: DrawingObject = {
      id: createId(),
      name: `${labelFor(type)} ${count}`,
      type,
      startTime: currentTime,
      endTime: options?.trackingEnabled ? Math.max(currentTime + .04, duration || currentTime + 3) : Math.min(duration || currentTime + 3, currentTime + 3),
      trackingEnabled: options?.trackingEnabled ?? false,
      target: options?.target,
      keyframes: [],
      animation: { fadeIn: type === "playerRing" ? .42 : .18, fadeOut: 0.18, motion: type === "playerRing" ? "ringLock" : "none", pulseAmount: .05, pulseSpeed: 1.4 },
      style: { ...DEFAULT_STYLE, ...effectStyle, dash: [] },
      transform: { ...DEFAULT_TRANSFORM },
      data,
    };
    addDrawing(object);
    setDraft(null);
    setTool("select");
  }, [addDrawing, currentTime, drawings, duration, setTool]);

  const placeRingOnPlayer = useCallback(async (click: Point) => {
    if (detectingPlayer) return;
    if (drawings.some((drawing) => drawing.type === "playerRing" && drawing.trackingEnabled)) {
      setDetectionMessage("Já existe um tracking ativo. Termine-o antes de selecionar outro jogador.");
      window.setTimeout(() => setDetectionMessage(null), 3200);
      return;
    }
    setDetectionEffect({ phase: "scanning", click });
    const video = getVideoElement?.();
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setDetectionMessage("O fotograma do vídeo ainda não está pronto.");
      setDetectionEffect({ phase: "failed", click });
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 2600);
      return;
    }

    video.pause();
    setDetectingPlayer(true);
    setDetectionMessage("A analisar a zona selecionada…");
    try {
      const crop = makeDetectionCrop(video, click);
      const cropDetections = await detectPlayers(crop.canvas);
      let boxes = cropDetections.map((detection) => ({
        detection,
        box: {
          x: (crop.sourceX + detection.bbox[0] / crop.canvas.width * crop.cropWidth) / video.videoWidth,
          y: (crop.sourceY + detection.bbox[1] / crop.canvas.height * crop.cropHeight) / video.videoHeight,
          width: detection.bbox[2] / crop.canvas.width * crop.cropWidth / video.videoWidth,
          height: detection.bbox[3] / crop.canvas.height * crop.cropHeight / video.videoHeight,
        },
      }));
      let match = boxes
        .filter(({ box }) => containsPoint(box, click))
        .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];

      if (!match) {
        setDetectionMessage("A confirmar o jogador no fotograma completo…");
        const fullDetections = await detectPlayers(video);
        const fullBoxes = fullDetections.map((detection) => ({
          detection,
          box: {
            x: detection.bbox[0] / video.videoWidth,
            y: detection.bbox[1] / video.videoHeight,
            width: detection.bbox[2] / video.videoWidth,
            height: detection.bbox[3] / video.videoHeight,
          },
        }));
        boxes = [...boxes, ...fullBoxes];
        match = fullBoxes
          .filter(({ box }) => containsPoint(box, click))
          .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];
      }

      if (!match) {
        setDetectionBoxes(boxes.map(({ box }) => box));
        setDetectionEffect({ phase: "failed", click });
        setDetectionMessage(boxes.length
          ? "Esse jogador não foi reconhecido. As caixas mostram os jogadores detetados; tente outro ponto do corpo."
          : "Não encontrei jogadores neste fotograma. Tente avançar alguns frames ou usar uma imagem mais próxima.");
        window.setTimeout(() => { setDetectionMessage(null); setDetectionBoxes([]); setDetectionEffect(null); }, 4200);
        return;
      }

      setDetectionEffect({ phase: "locked", click, box: match.box, score: match.detection.score });
      setDetectionMessage(`Jogador identificado · ${Math.round(match.detection.score * 100)}%`);
      await wait(620);

      const foot = {
        x: clamp(match.box.x + match.box.width / 2, 0, 1),
        y: clamp(match.box.y + match.box.height, 0, 1),
      };
      const radiusX = clamp(match.box.width * 1.7, 0.025, 0.08);
      const radiusY = clamp(radiusX * 0.58, 0.01, 0.042);
      const trackId = createId();
      const track: PlayerTrack = {
        id: trackId,
        name: `Jogador ${drawings.filter((item) => item.target?.kind === "player").length + 1}`,
        source: "automatic",
        status: "processing",
        appearanceColor: sampleJerseyColor(video, [
          match.box.x * video.videoWidth,
          match.box.y * video.videoHeight,
          match.box.width * video.videoWidth,
          match.box.height * video.videoHeight,
        ]),
        samples: [{ time: currentTime, bbox: match.box, foot, confidence: match.detection.score }],
      };
      addPlayerTrack(track);
      makeDrawing(
        "playerRing",
        { kind: "playerRing", center: foot, radiusX, radiusY },
        { target: { kind: "player", trackId, anchor: "feet" }, trackingEnabled: true },
      );
      setDetectionBoxes([]);
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 1500);
    } catch {
      setDetectionBoxes([]);
      setDetectionEffect({ phase: "failed", click });
      setDetectionMessage("Não foi possível analisar este fotograma. Confirme o acesso ao vídeo e tente novamente.");
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 4200);
    } finally {
      setDetectingPlayer(false);
    }
  }, [addPlayerTrack, currentTime, detectingPlayer, drawings, getVideoElement, makeDrawing]);

  const activeSlide = slides.find((slide) => slide.id === selectedSlideId);
  const activeTrackingDrawing = [...drawings].reverse().find((drawing) => drawing.type === "playerRing" && drawing.trackingEnabled && drawing.target?.kind === "player");
  const activePlayerTrack = activeTrackingDrawing?.target?.kind === "player" && activeSlide?.content.kind === "video"
    ? activeSlide.content.playerTracks?.find((track) => track.id === activeTrackingDrawing.target?.trackId)
    : undefined;

  useEffect(() => {
    const drawing = activeTrackingDrawing;
    const track = activePlayerTrack;
    const video = getVideoElement?.();
    if (!drawing || !track || !video || !isPlaying || detectingPlayer || trackingBusyRef.current) return;
    if (currentTime < drawing.startTime || currentTime > drawing.endTime) return;

    const lastProcessed = lastTrackingFrameRef.current[drawing.id] ?? drawing.startTime;
    if (currentTime < lastProcessed - .3) lastTrackingFrameRef.current[drawing.id] = currentTime - .2;
    if (currentTime - (lastTrackingFrameRef.current[drawing.id] ?? drawing.startTime) < .14) return;

    const samplesUpToFrame = track.samples.filter((sample) => sample.time <= currentTime + .04);
    const previous = samplesUpToFrame.at(-1) ?? track.samples.at(-1);
    if (!previous) return;

    const capturedTime = currentTime;
    const crop = makeTrackingCrop(video, previous.bbox);
    const fullFrame = document.createElement("canvas");
    fullFrame.width = 640;
    fullFrame.height = Math.round(640 * video.videoHeight / video.videoWidth);
    fullFrame.getContext("2d")?.drawImage(video, 0, 0, fullFrame.width, fullFrame.height);
    lastTrackingFrameRef.current[drawing.id] = capturedTime;
    trackingBusyRef.current = true;

    void (async () => {
      try {
        const recentSamples = samplesUpToFrame.slice(-2);
        const older = recentSamples.length > 1 ? recentSamples[0] : undefined;
        const elapsed = older ? Math.max(.04, previous.time - older.time) : 1;
        const predictionTime = Math.max(0, capturedTime - previous.time);
        const predictedFoot = {
          x: clamp(previous.foot.x + (older ? (previous.foot.x - older.foot.x) / elapsed * predictionTime : 0), 0, 1),
          y: clamp(previous.foot.y + (older ? (previous.foot.y - older.foot.y) / elapsed * predictionTime : 0), 0, 1),
        };

        const toCandidates = (detections: Awaited<ReturnType<typeof detectPlayers>>, source: HTMLCanvasElement, cropData?: typeof crop) => detections.map((detection) => {
          const box = cropData ? {
            x: (cropData.sourceX + detection.bbox[0] / source.width * cropData.cropWidth) / video.videoWidth,
            y: (cropData.sourceY + detection.bbox[1] / source.height * cropData.cropHeight) / video.videoHeight,
            width: detection.bbox[2] / source.width * cropData.cropWidth / video.videoWidth,
            height: detection.bbox[3] / source.height * cropData.cropHeight / video.videoHeight,
          } : {
            x: detection.bbox[0] / source.width,
            y: detection.bbox[1] / source.height,
            width: detection.bbox[2] / source.width,
            height: detection.bbox[3] / source.height,
          };
          return {
            detection,
            box,
            foot: { x: box.x + box.width / 2, y: box.y + box.height },
            appearanceColor: sampleJerseyColor(source, detection.bbox),
          };
        });

        let candidates = toCandidates(await detectPlayers(crop.canvas), crop.canvas, crop);
        const maximumDistance = Math.max(.045, previous.bbox.height * 1.8);
        candidates = candidates.filter((candidate) => Math.hypot(candidate.foot.x - predictedFoot.x, candidate.foot.y - predictedFoot.y) <= maximumDistance);

        if (!candidates.length) {
          const fullCandidates = toCandidates(await detectPlayers(fullFrame), fullFrame);
          candidates = fullCandidates.filter((candidate) => Math.hypot(candidate.foot.x - predictedFoot.x, candidate.foot.y - predictedFoot.y) <= Math.max(.09, previous.bbox.height * 2.8));
        }

        const ranked = candidates.map((candidate) => {
          const spatial = Math.hypot(candidate.foot.x - predictedFoot.x, candidate.foot.y - predictedFoot.y) / Math.max(.018, previous.bbox.height);
          const sizeChange = Math.abs(Math.log(Math.max(.15, candidate.box.height / Math.max(.001, previous.bbox.height))));
          const appearance = track.appearanceColor && candidate.appearanceColor ? colorDistance(track.appearanceColor, candidate.appearanceColor) : 0;
          return { ...candidate, cost: spatial + sizeChange * .42 + appearance * .7 - candidate.detection.score * .28 };
        }).sort((left, right) => left.cost - right.cost);
        const match = ranked[0];

        if (!match) {
          const misses = (trackingMissesRef.current[drawing.id] ?? 0) + 1;
          trackingMissesRef.current[drawing.id] = misses;
          setTrackingQuality("reacquiring");
          if (misses >= 8) setPlayerTrackStatus(track.id, "needs-review");
          return;
        }

        if (!useEditorStore.getState().drawings.find((item) => item.id === drawing.id)?.trackingEnabled) return;
        trackingMissesRef.current[drawing.id] = 0;
        setTrackingQuality("tracking");
        const initial = track.samples[0];
        const scale = clamp(match.box.height / Math.max(.001, initial.bbox.height), .55, 2.2);
        appendPlayerTrackingSample(
          drawing.id,
          track.id,
          { time: capturedTime, bbox: match.box, foot: match.foot, confidence: match.detection.score },
          { time: capturedTime, x: match.foot.x - initial.foot.x, y: match.foot.y - initial.foot.y, scaleX: scale, scaleY: scale },
        );
      } catch {
        setTrackingQuality("reacquiring");
      } finally {
        trackingBusyRef.current = false;
      }
    })();
  }, [activePlayerTrack, activeTrackingDrawing, appendPlayerTrackingSample, currentTime, detectingPlayer, getVideoElement, isPlaying, setPlayerTrackStatus]);

  const stopActiveTracking = useCallback(() => {
    if (!activeTrackingDrawing || activeTrackingDrawing.target?.kind !== "player") return;
    updateDrawing(activeTrackingDrawing.id, {
      trackingEnabled: false,
      endTime: Math.max(activeTrackingDrawing.startTime + .04, currentTime),
    });
    setPlayerTrackStatus(activeTrackingDrawing.target.trackId, "ready");
    setTrackingQuality(null);
  }, [activeTrackingDrawing, currentTime, setPlayerTrackStatus, updateDrawing]);

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
    if (tool === "playerRing") {
      void placeRingOnPlayer(point);
      return;
    }
    if (tool === "spotlight") {
      makeDrawing("spotlight", { kind: "spotlight", target: point, radiusX: .065, radiusY: .022, beamHeight: .28 });
      return;
    }
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
    <>
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      className={`drawing-stage tool-${tool}${detectingPlayer ? " is-detecting" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDblClick={finishPolygon}
      onDblTap={finishPolygon}
    >
      <Layer>
        {detectionBoxes.map((box, index) => (
          <Rect
            key={`detected-player-${index}`}
            listening={false}
            x={box.x * width}
            y={box.y * height}
            width={box.width * width}
            height={box.height * height}
            stroke="#ffb347"
            strokeWidth={1.5}
            dash={[5, 4]}
            fill="#ffb3470d"
          />
        ))}
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
    {detectionEffect && (
      <div className={`player-identification-effect phase-${detectionEffect.phase}`} aria-hidden="true">
        {detectionEffect.phase !== "locked" && (
          <div
            className="player-scan-reticle"
            style={{ left: `${detectionEffect.click.x * 100}%`, top: `${detectionEffect.click.y * 100}%` }}
          >
            <i className="scan-ring scan-ring-a" />
            <i className="scan-ring scan-ring-b" />
            <i className="scan-crosshair" />
          </div>
        )}
        {detectionEffect.phase === "locked" && detectionEffect.box && (
          <div
            className="player-lock-box"
            style={{
              left: `${detectionEffect.box.x * 100}%`,
              top: `${detectionEffect.box.y * 100}%`,
              width: `${detectionEffect.box.width * 100}%`,
              height: `${detectionEffect.box.height * 100}%`,
            }}
          >
            <i className="lock-scan-line" />
            <span>JOGADOR IDENTIFICADO · {Math.round((detectionEffect.score ?? 0) * 100)}%</span>
          </div>
        )}
      </div>
    )}
    {activeTrackingDrawing && activePlayerTrack && (
      <div className={`player-tracking-hud ${trackingQuality === "reacquiring" ? "is-reacquiring" : ""}`}>
        <span className="tracking-live-dot" />
        <div>
          <strong>{trackingQuality === "reacquiring" ? "A RECUPERAR JOGADOR" : isPlaying ? "TRACKING ATIVO" : "TRACKING PRONTO"}</strong>
          <small>{isPlaying ? `${activePlayerTrack.samples.length} posições analisadas` : "Reproduza o vídeo para acompanhar"}</small>
        </div>
        <button type="button" onClick={stopActiveTracking}>Parar</button>
      </div>
    )}
    {detectionMessage && <div className={`player-detection-toast${detectionEffect?.phase === "scanning" ? " loading" : ""}`}>{detectionMessage}</div>}
    </>
  );
}
