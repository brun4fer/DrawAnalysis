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
import { timelineTimeToSource } from "@/utils/videoTimeline";
import { DrawingShape } from "./DrawingShape";
import { PlayerOcclusionCanvas } from "./PlayerOcclusionCanvas";
import { PlayerLabelOverlay } from "./PlayerLabelOverlay";

interface Props {
  width: number;
  height: number;
  registerCapture?: (capture: (() => HTMLCanvasElement | null) | null) => void;
  getVideoElement?: () => HTMLVideoElement | null;
}

interface Draft { tool: Tool; start: Point; points: Point[]; current: Point }
interface DetectionEffect { phase: "scanning" | "locked" | "failed"; click: Point; box?: NormalizedBox; score?: number }

const labelFor = (kind: DrawingObject["type"]) => ({
  playerRing: "Ring", spotlight: "Spotlight", ellipse: "Marcador", arrow: "Seta", longBallArrow: "Bola longa", line: "Linha", triangle: "Triângulo",
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

function touchesFrameEdge(box: NormalizedBox, margin = .025) {
  return box.x <= margin
    || box.y <= margin
    || box.x + box.width >= 1 - margin
    || box.y + box.height >= 1 - margin;
}

function isMovingOutOfFrame(current: PlayerTrack["samples"][number], previous?: PlayerTrack["samples"][number]) {
  if (!previous) return false;
  const velocityX = current.foot.x - previous.foot.x;
  const velocityY = current.foot.y - previous.foot.y;
  const margin = .015;
  return (current.bbox.x <= margin && velocityX < -.001)
    || (current.bbox.x + current.bbox.width >= 1 - margin && velocityX > .001)
    || (current.bbox.y <= margin && velocityY < -.001)
    || (current.bbox.y + current.bbox.height >= 1 - margin && velocityY > .001);
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

type PlayerDetection = Awaited<ReturnType<typeof detectPlayers>>[number];
interface PlayerDetectionMatch { detection: PlayerDetection; box: NormalizedBox }

async function detectPlayerAtPoint(video: HTMLVideoElement, click: Point) {
  const crop = makeDetectionCrop(video, click);
  const cropDetections = await detectPlayers(crop.canvas);
  let boxes: PlayerDetectionMatch[] = cropDetections.map((detection) => ({
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
  let usedFullFrame = false;

  if (!match) {
    usedFullFrame = true;
    const fullDetections = await detectPlayers(video);
    const fullBoxes: PlayerDetectionMatch[] = fullDetections.map((detection) => ({
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

  return { match, boxes, usedFullFrame };
}

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
  const occlusionCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackingBusyRef = useRef(false);
  const lastTrackingFrameRef = useRef<Record<string, number>>({});
  const trackingMissesRef = useRef<Record<string, number>>({});
  const activeSlide = slides.find((slide) => slide.id === selectedSlideId);
  const activeVideoContent = activeSlide?.content.kind === "video" ? activeSlide.content : null;
  const activeFreezeFrames = activeVideoContent?.freezeFrames;
  const activeFreezeFramesRef = useRef(activeFreezeFrames);

  useEffect(() => { activeFreezeFramesRef.current = activeFreezeFrames; }, [activeFreezeFrames]);

  useEffect(() => {
    const capture = () => {
      const stage = stageRef.current;
      if (!stage) return null;
      const selection = stage.find(".selection-transformer");
      selection.forEach((node) => node.hide());
      stage.draw();
      const canvas = stage.toCanvas({ pixelRatio: 1 });
      const context = canvas.getContext("2d");
      if (context && occlusionCanvasRef.current) context.drawImage(occlusionCanvasRef.current, 0, 0, canvas.width, canvas.height);
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
      ? { stroke: "#f7f8f2", fill: "#1454c4", strokeWidth: 3, shadowColor: "#f1e72b", shadowBlur: 22, shadowOpacity: .82 }
      : type === "spotlight"
        ? { stroke: "#fff8c7", fill: "#fff8c733", strokeWidth: 2, shadowColor: "#fff2a8", shadowBlur: 22, shadowOpacity: .6 }
        : type === "arrow" || type === "longBallArrow"
          ? { stroke: "#65d9ff", strokeWidth: 5, shadowColor: "#000000", shadowBlur: 10, shadowOpacity: .68, shadowOffsetX: 3, shadowOffsetY: 5 }
          : {};
    const timelinePoint = timelineTimeToSource(currentTime, activeFreezeFramesRef.current);
    const isFreezeDrawing = Boolean(timelinePoint.freeze && timelinePoint.freezeStart !== undefined && timelinePoint.freezeEnd !== undefined);
    const drawingStartTime = isFreezeDrawing ? timelinePoint.freezeStart! : currentTime;
    const defaultEndTime = type === "playerRing" ? currentTime + 4 : currentTime + 3;
    const drawingEndTime = isFreezeDrawing
      ? timelinePoint.freezeEnd!
      : options?.trackingEnabled
        ? Math.max(currentTime + .04, duration || defaultEndTime)
        : Math.min(duration || defaultEndTime, defaultEndTime);
    const object: DrawingObject = {
      id: createId(),
      name: `${labelFor(type)} ${count}`,
      type,
      startTime: drawingStartTime,
      endTime: drawingEndTime,
      trackingEnabled: options?.trackingEnabled ?? false,
      target: options?.target,
      keyframes: [],
      animation: { fadeIn: 0, fadeOut: 0, motion: "none", pulseAmount: .05, pulseSpeed: 1.4 },
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
      const result = await detectPlayerAtPoint(video, click);
      if (result.usedFullFrame) {
        setDetectionMessage("A confirmar o jogador no fotograma completo…");
      }
      const { match, boxes } = result;

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
        x: clamp(click.x * .72 + (match.box.x + match.box.width / 2) * .28, 0, 1),
        y: clamp(match.box.y + match.box.height, 0, 1),
      };
      const radiusX = clamp(match.box.width * 2.2, 0.04, 0.09);
      const radiusY = clamp(radiusX * .48, .012, .038);
      const trackId = createId();
      const track: PlayerTrack = {
        id: trackId,
        name: `Jogador ${drawings.filter((item) => item.target?.kind === "player").length + 1}`,
        source: "automatic",
        status: "seeded",
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
        {
          kind: "playerRing",
          center: foot,
          radiusX,
          radiusY,
          occlusionWidth: match.box.width * 1.05,
          labelOffsetY: match.box.height + .055,
          label: { visible: true, number: "", position: "", name: track.name.toUpperCase(), color: "#ffffff", fontSize: .032 },
          ringDesign: "broadcast",
          spinEnabled: true,
          spinSpeed: 1,
        },
        { target: { kind: "player", trackId, anchor: "feet" }, trackingEnabled: false },
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

  const placeSpotlightOnPlayer = useCallback(async (click: Point) => {
    if (detectingPlayer) return;
    const video = getVideoElement?.();
    setDetectionEffect({ phase: "scanning", click });
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setDetectionMessage("O fotograma do vídeo ainda não está pronto.");
      setDetectionEffect({ phase: "failed", click });
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 2600);
      return;
    }

    video.pause();
    setDetectingPlayer(true);
    setDetectionMessage("A ajustar o spotlight ao jogador…");
    try {
      const { match, boxes } = await detectPlayerAtPoint(video, click);
      if (!match) {
        setDetectionBoxes(boxes.map(({ box }) => box));
        setDetectionEffect({ phase: "failed", click });
        setDetectionMessage("Não consegui ajustar o spotlight a esse jogador. Tente clicar no centro do corpo.");
        window.setTimeout(() => { setDetectionMessage(null); setDetectionBoxes([]); setDetectionEffect(null); }, 4200);
        return;
      }

      const target = {
        x: clamp(match.box.x + match.box.width / 2, 0, 1),
        y: clamp(match.box.y + match.box.height, 0, 1),
      };
      setDetectionEffect({ phase: "locked", click, box: match.box, score: match.detection.score });
      setDetectionMessage(`Spotlight ajustado · ${Math.round(match.detection.score * 100)}%`);
      await wait(420);
      makeDrawing("spotlight", {
        kind: "spotlight",
        target,
        radiusX: clamp(match.box.width * 1.35, .028, .085),
        radiusY: clamp(match.box.width * .34, .009, .026),
        beamHeight: clamp(match.box.height * 1.18, .12, .42),
      });
      setDetectionBoxes([]);
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 1500);
    } catch {
      setDetectionBoxes([]);
      setDetectionEffect({ phase: "failed", click });
      setDetectionMessage("Não foi possível analisar este fotograma para o spotlight.");
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 3600);
    } finally {
      setDetectingPlayer(false);
    }
  }, [detectingPlayer, getVideoElement, makeDrawing]);

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

        if (isMovingOutOfFrame(previous, older)) {
          updateDrawing(drawing.id, {
            trackingEnabled: false,
            endTime: Math.max(drawing.startTime + .04, previous.time),
          });
          setPlayerTrackStatus(track.id, "ready");
          setTrackingQuality(null);
          setDetectionMessage("Tracking terminado: o jogador saiu do enquadramento.");
          window.setTimeout(() => setDetectionMessage(null), 3600);
          return;
        }

        const toCandidates = (detections: Awaited<ReturnType<typeof detectPlayers>>, source: HTMLCanvasElement) => detections.map((detection) => {
          const box = {
            x: (crop.sourceX + detection.bbox[0] / source.width * crop.cropWidth) / video.videoWidth,
            y: (crop.sourceY + detection.bbox[1] / source.height * crop.cropHeight) / video.videoHeight,
            width: detection.bbox[2] / source.width * crop.cropWidth / video.videoWidth,
            height: detection.bbox[3] / source.height * crop.cropHeight / video.videoHeight,
          };
          return {
            detection,
            box,
            foot: { x: box.x + box.width / 2, y: box.y + box.height },
            appearanceColor: sampleJerseyColor(source, detection.bbox),
          };
        });

        const maximumDistance = Math.max(.022, previous.bbox.height * .82);
        const ranked = toCandidates(await detectPlayers(crop.canvas), crop.canvas).map((candidate) => {
          const absoluteDistance = Math.hypot(candidate.foot.x - predictedFoot.x, candidate.foot.y - predictedFoot.y);
          const spatial = absoluteDistance / Math.max(.018, previous.bbox.height);
          const sizeRatio = candidate.box.height / Math.max(.001, previous.bbox.height);
          const sizeChange = Math.abs(Math.log(Math.max(.15, sizeRatio)));
          const appearance = track.appearanceColor && candidate.appearanceColor ? colorDistance(track.appearanceColor, candidate.appearanceColor) : 0;
          const personAspect = candidate.box.height * video.videoHeight / Math.max(1, candidate.box.width * video.videoWidth);
          return { ...candidate, absoluteDistance, sizeRatio, appearance, personAspect, cost: spatial + sizeChange * .58 + appearance * 1.15 - candidate.detection.score * .22 };
        }).filter((candidate) => candidate.absoluteDistance <= maximumDistance
          && candidate.sizeRatio >= .62
          && candidate.sizeRatio <= 1.58
          && candidate.personAspect >= .82
          && (!track.appearanceColor || !candidate.appearanceColor || candidate.appearance <= .3)
        ).sort((left, right) => left.cost - right.cost);
        const ambiguous = ranked.length > 1 && ranked[1].cost - ranked[0].cost < .14;
        const match = ambiguous ? undefined : ranked[0];

        if (!match) {
          const misses = (trackingMissesRef.current[drawing.id] ?? 0) + 1;
          trackingMissesRef.current[drawing.id] = misses;
          setTrackingQuality("reacquiring");
          const leftFrame = touchesFrameEdge(previous.bbox);
          if (leftFrame || misses >= 4) {
            updateDrawing(drawing.id, {
              trackingEnabled: false,
              endTime: Math.max(drawing.startTime + .04, previous.time),
            });
            setPlayerTrackStatus(track.id, leftFrame ? "ready" : "needs-review");
            setTrackingQuality(null);
            setDetectionMessage(leftFrame
              ? "Tracking terminado: o jogador saiu do enquadramento."
              : "Tracking terminado: deixou de ser possível confirmar a identidade do jogador.");
            window.setTimeout(() => setDetectionMessage(null), 3600);
          }
          return;
        }

        if (!useEditorStore.getState().drawings.find((item) => item.id === drawing.id)?.trackingEnabled) return;
        trackingMissesRef.current[drawing.id] = 0;
        setTrackingQuality("tracking");
        const initial = track.samples[0];
        const predictedBox = {
          x: previous.bbox.x + predictedFoot.x - previous.foot.x,
          y: previous.bbox.y + predictedFoot.y - previous.foot.y,
          width: previous.bbox.width,
          height: previous.bbox.height,
        };
        const detectionWeight = .55;
        const smoothBox = {
          x: match.box.x * detectionWeight + predictedBox.x * (1 - detectionWeight),
          y: match.box.y * detectionWeight + predictedBox.y * (1 - detectionWeight),
          width: match.box.width * detectionWeight + predictedBox.width * (1 - detectionWeight),
          height: match.box.height * detectionWeight + predictedBox.height * (1 - detectionWeight),
        };
        const smoothFoot = { x: smoothBox.x + smoothBox.width / 2, y: smoothBox.y + smoothBox.height };
        const scale = clamp(smoothBox.height / Math.max(.001, initial.bbox.height), .55, 2.2);
        appendPlayerTrackingSample(
          drawing.id,
          track.id,
          { time: capturedTime, bbox: smoothBox, foot: smoothFoot, confidence: match.detection.score },
          { time: capturedTime, x: smoothFoot.x - initial.foot.x, y: smoothFoot.y - initial.foot.y, scaleX: scale, scaleY: scale },
        );
      } catch {
        const misses = (trackingMissesRef.current[drawing.id] ?? 0) + 1;
        trackingMissesRef.current[drawing.id] = misses;
        setTrackingQuality("reacquiring");
        if (touchesFrameEdge(previous.bbox) || misses >= 4) {
          updateDrawing(drawing.id, { trackingEnabled: false, endTime: Math.max(drawing.startTime + .04, previous.time) });
          setPlayerTrackStatus(track.id, touchesFrameEdge(previous.bbox) ? "ready" : "needs-review");
          setTrackingQuality(null);
          setDetectionMessage(touchesFrameEdge(previous.bbox)
            ? "Tracking terminado: o jogador saiu do enquadramento."
            : "Tracking terminado: deixou de ser possível confirmar a identidade do jogador.");
          window.setTimeout(() => setDetectionMessage(null), 3600);
        }
      } finally {
        trackingBusyRef.current = false;
      }
    })();
  }, [activePlayerTrack, activeTrackingDrawing, appendPlayerTrackingSample, currentTime, detectingPlayer, getVideoElement, isPlaying, setPlayerTrackStatus, updateDrawing]);

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
      void placeSpotlightOnPlayer(point);
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

    if (["ellipse", "rectangle", "arrow", "longBallArrow", "line"].includes(tool) && draft?.tool === tool) {
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
      if (tool === "longBallArrow") makeDrawing("longBallArrow", { kind: "longBallArrow", start: draft.start, end: point, curveHeight: .13 });
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
    if (tool === "longBallArrow") {
      const start = { x: draft.start.x * width, y: draft.start.y * height };
      const end = { x: draft.current.x * width, y: draft.current.y * height };
      const control = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - height * .26 };
      const points = Array.from({ length: 25 }, (_, index) => {
        const t = index / 24;
        const inverse = 1 - t;
        return { x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x, y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y };
      }).flatMap(({ x, y }) => [x, y]);
      return <Arrow listening={false} {...style} fill={DEFAULT_STYLE.stroke} points={points} pointerLength={12} pointerWidth={12} />;
    }
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
            renderMode="base"
          />
        ))}
        {preview}
        {draft && (tool === "polygon" || tool === "triangle") && draft.points.map((point, index) => (
          <Ellipse listening={false} key={index} x={point.x * width} y={point.y * height} radiusX={4} radiusY={4} fill="#fff" />
        ))}
        {tool === "text" && <Text text="Clique para adicionar texto" x={16} y={16} fill="#fff" opacity={0.5} fontSize={13} />}
      </Layer>
    </Stage>
    <PlayerOcclusionCanvas
      ref={occlusionCanvasRef}
      drawings={drawings}
      playerTracks={activeSlide?.content.kind === "video" ? activeSlide.content.playerTracks : undefined}
      currentTime={currentTime}
      width={width}
      height={height}
      getVideoElement={getVideoElement}
    />
    <PlayerLabelOverlay drawings={drawings} currentTime={currentTime} width={width} height={height} />
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
