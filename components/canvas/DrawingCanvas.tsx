"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Arc, Ellipse, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useEditorStore } from "@/store/useEditorStore";
import type { DrawingData, DrawingObject, DrawingTarget, NormalizedBox, ObjectTransform, PlayerTrack, Point, Tool } from "@/types/drawing";
import type { SamTrackingPerformanceReport, SamTrackingProgress } from "@/types/samTracking";
import { DEFAULT_STYLE, DEFAULT_TRANSFORM } from "@/types/drawing";
import { flattenPoints, toNormalized } from "@/utils/coordinates";
import { automaticLongBallControl, buildCurvedArrowGeometry, buildPolylineArrowGeometry } from "@/utils/curvedArrowGeometry";
import { createId } from "@/utils/id";
import { defaultDrawingAnimationFor, getObjectStateAtTime } from "@/utils/temporalRenderer";
import { sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";
import { playerGroundPoint, samplePlayerTrackAtTime, targetAvailableAtTime, targetOffsetAtTime } from "@/utils/playerTracking";
import { pointHitsSamTrackedPlayerMask, samTrackedPlayerStateAtTime } from "@/utils/samTrackedPlayer";
import { playerRingDimensions } from "@/utils/playerRing";
import { buildManualPlayerSample, pointHitsPlayerMask } from "@/utils/playerManualMask";
import { buildSamPlayerSample } from "@/utils/samPlayerMask";
import { SamClientError, segmentFrameAtPoint, segmentFrameInBox } from "@/lib/samClient";
import { prepareSamTrackingClip } from "@/lib/samClipRecorder";
import { trackSamPlayer } from "@/lib/samTrackingClient";
import { buildSamPlayerTracking, trimSamPlayerTracking } from "@/utils/samTracking";
import { isSupportedSamTrackingDuration, MAX_SAM_TRACKING_SECONDS } from "@/lib/samTrackingLimits";
import { applyFavoriteData } from "@/utils/toolFavorites";
import { DrawingShape } from "./DrawingShape";
import { ManualPlayerMaskEditor } from "./ManualPlayerMaskEditor";
import { SamMaskReview } from "./SamMaskReview";
import { SamTrackingOverlayCanvas } from "./SamTrackingOverlayCanvas";
import { PlayerOcclusionCanvas } from "./PlayerOcclusionCanvas";
import { PlayerLabelOverlay } from "./PlayerLabelOverlay";
import { ZoomLensCanvas } from "./ZoomLensCanvas";

interface Props {
  width: number;
  height: number;
  registerCapture?: (capture: (() => HTMLCanvasElement | null) | null) => void;
  getVideoElement?: () => HTMLVideoElement | null;
}

interface Draft { tool: Tool; start: Point; points: Point[]; current: Point; startTarget?: DrawingTarget; pointTargets?: Array<DrawingTarget | null> }
interface DetectionEffect { phase: "scanning" | "locked" | "failed"; click: Point; box?: NormalizedBox; score?: number }
interface IdentifiedPlayer { track: PlayerTrack; sample: PlayerTrack["samples"][number] }
interface ManualMaskSession {
  frame: HTMLCanvasElement;
  frameTime: number;
  track?: PlayerTrack;
  initialName: string;
}
interface SamMaskSession {
  phase: "loading" | "review" | "error" | "confirmed" | "tracking" | "tracked";
  click: Point;
  frame: HTMLCanvasElement;
  sample?: PlayerTrack["samples"][number];
  trackId?: string;
  trackingDuration?: number;
  trackingTrackIds?: string[];
  message?: string;
  retryable?: boolean;
  selectionMode?: "point" | "box";
  performance?: SamTrackingPerformanceReport;
}

const labelFor = (kind: DrawingObject["type"]) => ({
  identifyPlayer: "Jogador", playerLabel: "Etiqueta", playerRing: "Ring", ghost: "Ghost", spotlight: "Spotlight", zoom: "Zoom", ellipse: "Círculo", arrow: "Seta", longBallArrow: "Bola longa", line: "Linha", glimpse: "Visão", triangle: "Triângulo",
  polygon: "Zona", rectangle: "Retângulo", text: "Texto", freeDraw: "Traço",
})[kind];

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function trackingProgressMessage(progress: SamTrackingProgress) {
  if (progress.stage === "request-received") return "Excerto recebido pela função segura da Vercel…";
  if (progress.stage === "meta-upload") return "A enviar o excerto para a Meta…";
  if (progress.stage === "mask-conversion") return "A validar e preparar as máscaras recebidas…";
  if (progress.framesReceived !== undefined && progress.expectedFrames) {
    return `SAM 3.1 a processar · ${progress.framesReceived}/${progress.expectedFrames} fotogramas recebidos`;
  }
  return "SAM 3.1 a processar o tracking…";
}

// Kept only for opening legacy projects that already contain automatic tracks.
// The manual identification, Ring, Ghost and Spotlight paths never call these
// lazy modules, so the AI models are not loaded during the new workflow.
type DetectPlayers = typeof import("@/lib/playerDetector")["detectPlayers"];
const detectPlayers = async (...args: Parameters<DetectPlayers>): Promise<Awaited<ReturnType<DetectPlayers>>> => {
  const detector = await import("@/lib/playerDetector");
  return detector.detectPlayers(...args);
};
type SegmentPlayerAtPoint = typeof import("@/lib/playerSegmentation")["segmentPlayerAtPoint"];
const segmentPlayerAtPoint = async (...args: Parameters<SegmentPlayerAtPoint>): Promise<Awaited<ReturnType<SegmentPlayerAtPoint>>> => {
  const segmentation = await import("@/lib/playerSegmentation");
  return segmentation.segmentPlayerAtPoint(...args);
};

function containsPoint(box: NormalizedBox, point: Point) {
  const paddingX = Math.min(0.006, box.width * 0.12);
  const paddingY = Math.min(0.008, box.height * 0.08);
  return point.x >= box.x - paddingX
    && point.x <= box.x + box.width + paddingX
    && point.y >= box.y - paddingY
    && point.y <= box.y + box.height + paddingY;
}

function captureVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível capturar o fotograma original.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function makeDetectionCrop(frame: HTMLCanvasElement, click: Point, widthRatio: number, heightRatio: number, clickAnchorY = .5) {
  const cropWidth = frame.width * widthRatio;
  const cropHeight = frame.height * heightRatio;
  const sourceX = clamp(click.x * frame.width - cropWidth / 2, 0, frame.width - cropWidth);
  const sourceY = clamp(click.y * frame.height - cropHeight * clickAnchorY, 0, frame.height - cropHeight);
  const canvas = document.createElement("canvas");
  const scale = Math.min(7, 768 / Math.max(cropWidth, cropHeight));
  canvas.width = Math.max(384, Math.round(cropWidth * scale));
  canvas.height = Math.round(canvas.width * cropHeight / cropWidth);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a região selecionada.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
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

function boxIou(left: NormalizedBox, right: NormalizedBox) {
  const intersectionWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const intersectionHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = intersectionWidth * intersectionHeight;
  return intersection / Math.max(.000001, left.width * left.height + right.width * right.height - intersection);
}

function deduplicateDetections(candidates: PlayerDetectionMatch[]) {
  const kept: PlayerDetectionMatch[] = [];
  for (const candidate of [...candidates].sort((left, right) => right.detection.score - left.detection.score)) {
    if (kept.some((existing) => boxIou(existing.box, candidate.box) > .58)) continue;
    kept.push(candidate);
  }
  return kept;
}

function isNearPlayerFeet(box: NormalizedBox, point: Point) {
  const horizontalPadding = Math.max(.004, box.width * .24);
  const verticalPadding = Math.max(.006, box.height * .13);
  return point.x >= box.x - horizontalPadding
    && point.x <= box.x + box.width + horizontalPadding
    && point.y >= box.y + box.height * .64
    && point.y <= box.y + box.height + verticalPadding;
}

function clickedMatch(
  candidates: PlayerDetectionMatch[],
  click: Point,
  clickAnchor: "body" | "feet" = "body",
  frameWidth = 1,
  frameHeight = 1,
) {
  return candidates.filter(({ box }) => {
    if (clickAnchor !== "feet") return containsPoint(box, click);
    if (!isNearPlayerFeet(box, click)) return false;
    const boxWidth = Math.max(1, box.width * frameWidth);
    const boxHeight = Math.max(1, box.height * frameHeight);
    const aspect = boxHeight / boxWidth;
    const bottomCenter = { x: box.x + box.width / 2, y: box.y + box.height };
    const horizontalDistance = Math.abs(click.x - bottomCenter.x) * frameWidth;
    const verticalDistance = Math.abs(click.y - bottomCenter.y) * frameHeight;
    return aspect >= .72
      && aspect <= 7.5
      && horizontalDistance <= Math.max(8, boxWidth * .9)
      && verticalDistance <= Math.max(7, boxHeight * .22);
  }).sort((left, right) => {
    const leftAnchor = clickAnchor === "feet" ? { x: left.box.x + left.box.width / 2, y: left.box.y + left.box.height } : { x: left.box.x + left.box.width / 2, y: left.box.y + left.box.height / 2 };
    const rightAnchor = clickAnchor === "feet" ? { x: right.box.x + right.box.width / 2, y: right.box.y + right.box.height } : { x: right.box.x + right.box.width / 2, y: right.box.y + right.box.height / 2 };
    const cost = (candidate: PlayerDetectionMatch, anchor: Point) => {
      const boxWidth = Math.max(1, candidate.box.width * frameWidth);
      const boxHeight = Math.max(1, candidate.box.height * frameHeight);
      const deltaX = Math.abs(click.x - anchor.x) * frameWidth / Math.max(6, boxWidth * .85);
      const deltaY = Math.abs(click.y - anchor.y) * frameHeight / Math.max(5, boxHeight * (clickAnchor === "feet" ? .16 : .5));
      const aspect = boxHeight / boxWidth;
      const aspectPenalty = aspect < .85 ? (.85 - aspect) * 2.4 : aspect > 7 ? (aspect - 7) * .2 : 0;
      return Math.hypot(deltaX, deltaY) + aspectPenalty - candidate.detection.score * .34;
    };
    const leftCost = cost(left, leftAnchor);
    const rightCost = cost(right, rightAnchor);
    return leftCost - rightCost;
  })[0];
}

async function detectPlayerAtPoint(frame: HTMLCanvasElement, click: Point, clickAnchor: "body" | "feet" = "body") {
  const candidates: PlayerDetectionMatch[] = [];
  const cropSpecs = clickAnchor === "feet"
    ? [{ width: .06, height: .17 }, { width: .11, height: .27 }, { width: .19, height: .4 }]
    : [{ width: .085, height: .22 }, { width: .15, height: .34 }, { width: .25, height: .48 }];
  for (const spec of cropSpecs) {
    const crop = makeDetectionCrop(frame, click, spec.width, spec.height, clickAnchor === "feet" ? .82 : .5);
    const detections = await detectPlayers(crop.canvas, { maxNumBoxes: 30, minScore: .1 });
    candidates.push(...detections.map((detection) => ({
      detection,
      box: {
        x: (crop.sourceX + detection.bbox[0] / crop.canvas.width * crop.cropWidth) / frame.width,
        y: (crop.sourceY + detection.bbox[1] / crop.canvas.height * crop.cropHeight) / frame.height,
        width: detection.bbox[2] / crop.canvas.width * crop.cropWidth / frame.width,
        height: detection.bbox[3] / crop.canvas.height * crop.cropHeight / frame.height,
      },
    })));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  let boxes = deduplicateDetections(candidates);
  let match = clickedMatch(boxes, click, clickAnchor, frame.width, frame.height);
  let usedFullFrame = false;
  if (!match) {
    usedFullFrame = true;
    const detections = await detectPlayers(frame, { maxNumBoxes: 100, minScore: .12 });
    const fullBoxes: PlayerDetectionMatch[] = detections.map((detection) => ({
      detection,
      box: {
        x: detection.bbox[0] / frame.width,
        y: detection.bbox[1] / frame.height,
        width: detection.bbox[2] / frame.width,
        height: detection.bbox[3] / frame.height,
      },
    }));
    boxes = deduplicateDetections([...boxes, ...fullBoxes]);
    match = clickedMatch(boxes, click, clickAnchor, frame.width, frame.height);
  }
  return { match, boxes, usedFullFrame };
}

export function DrawingCanvas({ width, height, registerCapture, getVideoElement }: Props) {
  const {
    tool, drawings, selectedId, currentTime, duration, isPlaying, slides, selectedSlideId, favorites, activeFavoriteId, ringReidentifyId, maskEditTrackId,
    addDrawing, addPlayerTrack, updatePlayerTrackSample, appendPlayerTrackingSample, setPlayerTrackStatus, setPlayerSamTracking,
    updateDrawing, setSelectedId, setTool, cancelRingReidentify, cancelPlayerMaskEdit,
  } = useEditorStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [detectionBoxes, setDetectionBoxes] = useState<NormalizedBox[]>([]);
  const [detectionEffect, setDetectionEffect] = useState<DetectionEffect | null>(null);
  const [detectingPlayer, setDetectingPlayer] = useState(false);
  const [pendingGhost, setPendingGhost] = useState<IdentifiedPlayer | null>(null);
  const [manualMaskSession, setManualMaskSession] = useState<ManualMaskSession | null>(null);
  const [samMaskSession, setSamMaskSession] = useState<SamMaskSession | null>(null);
  const [samSelectionMode, setSamSelectionMode] = useState<"point" | "box">("point");
  const [samBoxDraft, setSamBoxDraft] = useState<{ start: Point; current: Point } | null>(null);
  const [ghostTransformPreview, setGhostTransformPreview] = useState<Record<string, ObjectTransform>>({});
  const [trackingQuality, setTrackingQuality] = useState<"tracking" | "reacquiring" | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const occlusionCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackingBusyRef = useRef(false);
  const lastTrackingFrameRef = useRef<Record<string, number>>({});
  const trackingMissesRef = useRef<Record<string, number>>({});
  const samAbortRef = useRef<AbortController | null>(null);
  const activeSlide = slides.find((slide) => slide.id === selectedSlideId);
  const activeVideoContent = activeSlide?.content.kind === "video" ? activeSlide.content : null;
  const activeFreezeFrames = activeVideoContent?.freezeFrames;
  const activeFreezeFramesRef = useRef(activeFreezeFrames);
  const samTrackingCandidates = samMaskSession?.sample?.mask
    ? (activeVideoContent?.playerTracks ?? []).flatMap((track) => {
        const seed = track.samples.find((candidate) => Math.abs(candidate.time - samMaskSession.sample!.time) < .05 && candidate.mask);
        return seed ? [{ id: track.id, name: track.name }] : [];
      })
    : [];

  useEffect(() => { activeFreezeFramesRef.current = activeFreezeFrames; }, [activeFreezeFrames]);

  useEffect(() => {
    if (tool === "sam31") return;
    samAbortRef.current?.abort();
    samAbortRef.current = null;
    if (!samMaskSession) return;
    const animationFrame = window.requestAnimationFrame(() => setSamMaskSession(null));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [samMaskSession, tool]);

  useEffect(() => {
    if (tool === "sam31") return;
    const animationFrame = window.requestAnimationFrame(() => setSamBoxDraft(null));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [tool]);

  useEffect(() => {
    if (tool !== "identifyPlayer") {
      if (!manualMaskSession) return;
      const animationFrame = window.requestAnimationFrame(() => setManualMaskSession(null));
      return () => window.cancelAnimationFrame(animationFrame);
    }
    if (manualMaskSession) return;
    const video = getVideoElement?.();
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const messageTimer = window.setTimeout(() => setDetectionMessage("O fotograma do vídeo ainda não está pronto."), 0);
      const closeTimer = window.setTimeout(() => { setDetectionMessage(null); setTool("select"); }, 2400);
      return () => { window.clearTimeout(messageTimer); window.clearTimeout(closeTimer); };
    }
    video.pause();
    try {
      const track = maskEditTrackId
        ? activeVideoContent?.playerTracks?.find((candidate) => candidate.id === maskEditTrackId)
        : undefined;
      const frame = captureVideoFrame(video);
      const animationFrame = window.requestAnimationFrame(() => setManualMaskSession({
        frame,
        frameTime: currentTime,
        track,
        initialName: track?.name ?? `Jogador ${(activeVideoContent?.playerTracks?.length ?? 0) + 1}`,
      }));
      return () => window.cancelAnimationFrame(animationFrame);
    } catch {
      const messageTimer = window.setTimeout(() => setDetectionMessage("Não foi possível capturar este fotograma para edição."), 0);
      const closeTimer = window.setTimeout(() => { setDetectionMessage(null); setTool("select"); }, 2600);
      return () => { window.clearTimeout(messageTimer); window.clearTimeout(closeTimer); };
    }
  }, [activeVideoContent?.playerTracks, currentTime, getVideoElement, manualMaskSession, maskEditTrackId, setTool, tool]);

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
      if (context && zoomCanvasRef.current) context.drawImage(zoomCanvasRef.current, 0, 0, canvas.width, canvas.height);
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
    options?: { target?: DrawingObject["target"]; trackingEnabled?: boolean; keepTool?: boolean; startTime?: number; endTime?: number },
  ) => {
    const count = drawings.filter((item) => item.type === type).length + 1;
    const actionCount = drawings.filter((item) => ["line", "arrow", "longBallArrow"].includes(item.type)).length + 1;
    const effectStyle = type === "identifyPlayer"
      ? { stroke: "#a3ff12", fill: "#00000000", strokeWidth: 0, shadowColor: "#000000", shadowBlur: 0, shadowOpacity: 0 }
      : type === "playerLabel"
      ? { stroke: "#ffffff", fill: "#ffffff", strokeWidth: 2, shadowColor: "#000000", shadowBlur: 6, shadowOpacity: .65 }
      : type === "playerRing"
      ? { stroke: "#f7f8f2", fill: "#1454c4", strokeWidth: 3, shadowColor: "#f1e72b", shadowBlur: 0, shadowOpacity: 0, shadowOffsetX: 0, shadowOffsetY: 0 }
      : type === "ghost"
        ? { stroke: "#ffffff", fill: "#ffffff14", strokeWidth: 3, shadowColor: "#ffffff", shadowBlur: 14, shadowOpacity: .7 }
      : type === "spotlight"
        ? { stroke: "#fff8c7", fill: "#fff8c733", strokeWidth: 2, shadowColor: "#fff2a8", shadowBlur: 22, shadowOpacity: .6 }
        : type === "zoom"
          ? { stroke: "#ffffff", fill: "#ffffff12", strokeWidth: 4, shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .82, shadowOffsetX: 2, shadowOffsetY: 5 }
          : type === "glimpse"
            ? { stroke: "#ffffff", fill: "#ffffff38", strokeWidth: 2, shadowColor: "#ffffff", shadowBlur: 18, shadowOpacity: .6 }
          : type === "ellipse"
            ? { stroke: "#65d9ff", fill: "#65d9ff47", strokeWidth: 0, shadowColor: "#65d9ff", shadowBlur: 12, shadowOpacity: .48, shadowOffsetX: 0, shadowOffsetY: 2 }
          : type === "line"
            ? { stroke: "#65d9ff", strokeWidth: 6, shadowColor: "#000000", shadowBlur: 9, shadowOpacity: .58, shadowOffsetX: 4, shadowOffsetY: 7 }
        : type === "arrow"
          ? { stroke: "#65d9ff", strokeWidth: 7, shadowColor: "#000000", shadowBlur: 9, shadowOpacity: .58, shadowOffsetX: 4, shadowOffsetY: 7, groundHeight: .5 }
          : type === "longBallArrow"
            ? { stroke: "#65d9ff", strokeWidth: 6, shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .62, shadowOffsetX: 5, shadowOffsetY: 8 }
          : {};
    const timelinePoint = timelineTimeToSource(currentTime, activeFreezeFramesRef.current);
    const isFreezeDrawing = Boolean(timelinePoint.freeze && timelinePoint.freezeStart !== undefined && timelinePoint.freezeEnd !== undefined);
    const drawingStartTime = options?.startTime ?? (isFreezeDrawing ? timelinePoint.freezeStart! : currentTime);
    const defaultEndTime = type === "playerRing" ? currentTime + 4 : currentTime + 3;
    const drawingEndTime = options?.endTime ?? (isFreezeDrawing
      ? timelinePoint.freezeEnd!
      : options?.trackingEnabled
        ? Math.max(currentTime + .04, duration || defaultEndTime)
        : Math.min(duration || defaultEndTime, defaultEndTime));
    const favorite = favorites.find((item) => item.id === activeFavoriteId && item.type === type);
    const defaultActionLabel = ["line", "arrow", "longBallArrow"].includes(type)
      ? { visible: false, value: String(actionCount), position: .5, color: effectStyle.stroke ?? DEFAULT_STYLE.stroke, backgroundColor: "#174ea6", fontSize: .022 }
      : undefined;
    const object: DrawingObject = {
      id: createId(),
      name: `${labelFor(type)} ${count}`,
      type,
      startTime: drawingStartTime,
      endTime: drawingEndTime,
      trackingEnabled: options?.trackingEnabled ?? false,
      target: options?.target,
      keyframes: [],
      animation: favorite?.animation ? { ...structuredClone(favorite.animation), configured: true } : defaultDrawingAnimationFor(type),
      actionLabel: defaultActionLabel && favorite?.actionLabel
        ? { ...structuredClone(favorite.actionLabel), value: defaultActionLabel.value }
        : defaultActionLabel,
      style: favorite ? structuredClone(favorite.style) : { ...DEFAULT_STYLE, ...effectStyle, dash: [] },
      transform: { ...DEFAULT_TRANSFORM },
      data: favorite ? applyFavoriteData(data, favorite) : data,
    };
    addDrawing(object);
    setDraft(null);
    if (!options?.keepTool) setTool("select");
    return object;
  }, [activeFavoriteId, addDrawing, currentTime, drawings, duration, favorites, setTool]);

  const createRingForPlayer = (
    { track, sample }: IdentifiedPlayer,
    tracking?: { followSamTracking: true; startTime: number; endTime: number },
    showMovementArrow = false,
  ) => {
    const { radiusX, radiusY } = playerRingDimensions(sample.bbox, width, height);
    const labelFontSize = clamp(sample.bbox.height * .2, .012, .032);
    return makeDrawing(
      "playerRing",
      {
        kind: "playerRing",
        center: sample.foot,
        radiusX,
        radiusY,
        occlusionWidth: sample.bbox.width * 1.05,
        labelOffsetY: sample.bbox.height + clamp(labelFontSize * .9, .012, .028),
        label: { visible: true, number: "", position: "", name: track.name.toUpperCase(), color: "#ffffff", fontSize: labelFontSize },
        ringDesign: showMovementArrow ? "pitchSegmented" : "broadcast",
        // SAM-associated rings remain independent from the movement arrow and
        // keep their own subtle rotation while following the player.
        spinEnabled: true,
        spinSpeed: showMovementArrow ? .58 : 1,
        showRing: true,
        splashEnabled: false,
        splashSpeed: 1,
        showMovementArrow,
      },
      {
        target: {
          kind: "player",
          trackId: track.id,
          anchor: "feet",
          referenceFoot: sample.foot,
          followSamTracking: tracking?.followSamTracking,
        },
        // SAM-following is driven by the persisted mask timeline, not by the
        // legacy live/keyframe tracker represented by trackingEnabled.
        trackingEnabled: false,
        startTime: tracking?.startTime,
        endTime: tracking?.endTime,
      },
    );
  };

  const replaceRingPlayer = (drawingId: string, { track, sample }: IdentifiedPlayer) => {
    const ring = drawings.find((drawing) => drawing.id === drawingId);
    if (!ring || ring.data.kind !== "playerRing") return false;
    const { radiusX, radiusY } = playerRingDimensions(sample.bbox, width, height);
    const labelFontSize = clamp(sample.bbox.height * .2, .012, .032);
    updateDrawing(drawingId, {
      target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot },
      transform: { ...DEFAULT_TRANSFORM },
      data: {
        ...ring.data,
        center: sample.foot,
        radiusX,
        radiusY,
        occlusionWidth: sample.bbox.width * 1.05,
        labelOffsetY: sample.bbox.height + clamp(labelFontSize * .9, .012, .028),
        label: ring.data.label ? { ...ring.data.label, fontSize: labelFontSize } : ring.data.label,
      },
    });
    setSelectedId(drawingId);
    cancelRingReidentify();
    setTool("select");
    return true;
  };

  const findSavedPlayerAtPoint = async (
    point: Point,
    anchor: "body" | "feet",
    excludedTrackId?: string | null,
  ): Promise<IdentifiedPlayer | null> => {
    const candidates = (activeVideoContent?.playerTracks ?? [])
      .filter((track) => track.id !== excludedTrackId && track.samples.length)
      .map((track) => {
        const trackedState = samTrackedPlayerStateAtTime(track, currentTime);
        const savedSample = samplePlayerTrackAtTime(track, currentTime);
        return {
          track,
          trackedState,
          sample: trackedState ? {
            ...savedSample,
            time: currentTime,
            bbox: trackedState.bounds,
            foot: trackedState.foot,
            confidence: trackedState.frame.confidence ?? savedSample.confidence,
          } : savedSample,
        };
      })
      .filter(({ sample, trackedState }) => Boolean(trackedState) || (Math.abs(sample.time - currentTime) < .05 && Boolean(sample.mask)));
    const exact: Array<IdentifiedPlayer & { distance: number }> = [];
    for (const candidate of candidates) {
      const hit = candidate.trackedState
        ? pointHitsSamTrackedPlayerMask(candidate.trackedState, point)
        : candidate.sample.mask ? await pointHitsPlayerMask(candidate.sample.mask, point) : false;
      if (!hit) continue;
      exact.push({
        ...candidate,
        distance: Math.hypot((candidate.sample.foot.x - point.x) * width, (candidate.sample.foot.y - point.y) * height),
      });
    }
    if (exact.length) {
      const selected = exact.sort((left, right) => left.distance - right.distance)[0];
      return { track: selected.track, sample: selected.sample };
    }
    if (anchor === "body") return null;
    const nearFeet = candidates
      .map((candidate) => ({
        ...candidate,
        distance: Math.hypot((candidate.sample.foot.x - point.x) * width, (candidate.sample.foot.y - point.y) * height),
        tolerance: Math.max(9, Math.min(42, candidate.sample.bbox.height * height * .18)),
      }))
      .filter((candidate) => candidate.distance <= candidate.tolerance)
      .sort((left, right) => left.distance - right.distance)[0];
    return nearFeet ? { track: nearFeet.track, sample: nearFeet.sample } : null;
  };

  const selectSavedPlayerAtClick = async (click: Point, mode: "ring" | "ringReidentify" | "ghost" | "spotlight") => {
    const replacingRingId = mode === "ringReidentify" ? ringReidentifyId : null;
    const replacedTrackId = replacingRingId ? drawings.find((drawing) => drawing.id === replacingRingId)?.target?.trackId : null;
    const identified = await findSavedPlayerAtPoint(click, mode === "ring" || mode === "ringReidentify" ? "feet" : "body", replacedTrackId);
    if (!identified) {
      setDetectionMessage("Este jogador ainda não tem uma máscara neste fotograma. Use primeiro Identificar jogador.");
      window.setTimeout(() => setDetectionMessage(null), 3600);
      return null;
    }
    setDetectionMessage(`${identified.track.name} · máscara reutilizada`);
    window.setTimeout(() => setDetectionMessage(null), 1500);
    if (mode === "ring") {
      const tracking = identified.track.samTracking;
      if (tracking && samTrackedPlayerStateAtTime(identified.track, currentTime)) {
        createRingForPlayer(identified, {
          followSamTracking: true,
          startTime: tracking.startTime,
          endTime: tracking.endTime,
        });
        setDetectionMessage(`${identified.track.name} Â· Anel associado ao tracking SAM`);
      } else {
        createRingForPlayer(identified);
      }
    }
    if (mode === "ringReidentify" && replacingRingId) replaceRingPlayer(replacingRingId, identified);
    return identified;
  };

  const saveManualMask = (maskCanvas: HTMLCanvasElement, requestedName: string) => {
    if (!manualMaskSession) return;
    const sample = buildManualPlayerSample(manualMaskSession.frame, maskCanvas, manualMaskSession.frameTime);
    if (!sample) {
      setDetectionMessage("A máscara está vazia. Contorne pelo menos uma zona do jogador antes de guardar.");
      window.setTimeout(() => setDetectionMessage(null), 3200);
      return;
    }
    if (manualMaskSession.track) {
      updatePlayerTrackSample(manualMaskSession.track.id, sample, requestedName);
      setDetectionMessage(`${manualMaskSession.track.name} · máscara atualizada`);
    } else {
      const track: PlayerTrack = {
        id: createId(),
        name: requestedName.trim() || manualMaskSession.initialName,
        source: "manual",
        status: "ready",
        samples: [sample],
      };
      addPlayerTrack(track);
      const dimensions = playerRingDimensions(sample.bbox, width, height);
      makeDrawing(
        "identifyPlayer",
        { kind: "identifyPlayer", center: sample.foot, radiusX: dimensions.radiusX, radiusY: dimensions.radiusY },
        { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot }, trackingEnabled: false },
      );
      setDetectionMessage(`${track.name} · máscara manual guardada`);
    }
    setManualMaskSession(null);
    cancelPlayerMaskEdit();
    setTool("select");
    window.setTimeout(() => setDetectionMessage(null), 1800);
  };

  const cancelSamIdentification = () => {
    samAbortRef.current?.abort();
    samAbortRef.current = null;
    setSamBoxDraft(null);
    setSamMaskSession(null);
    setTool("select");
  };

  const cancelSamTracking = () => {
    samAbortRef.current?.abort();
    samAbortRef.current = null;
    setSamMaskSession((session) => session?.trackId && session.sample
      ? { ...session, phase: "confirmed", message: `Identificação guardada · escolha entre 1 e ${MAX_SAM_TRACKING_SECONDS} segundos para tentar novamente` }
      : null);
  };

  const repeatSamIdentification = () => {
    samAbortRef.current?.abort();
    samAbortRef.current = null;
    setSamMaskSession(null);
    setDetectionMessage(samSelectionMode === "box"
      ? "SAM 3.1 pronto · desenhe novamente a caixa à volta do jogador"
      : "SAM 3.1 pronto · clique novamente no centro do jogador");
    window.setTimeout(() => setDetectionMessage(null), 2200);
  };

  const startSamIdentification = async (click: Point) => {
    if (samMaskSession?.phase === "loading") return;
    const video = getVideoElement?.();
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setDetectionMessage("O fotograma do vídeo ainda não está pronto.");
      window.setTimeout(() => setDetectionMessage(null), 2600);
      return;
    }
    video.pause();
    let frame: HTMLCanvasElement;
    try {
      frame = captureVideoFrame(video);
    } catch {
      setDetectionMessage("Não foi possível ler este fotograma. Confirme o CORS do vídeo Cloudflare R2 e tente novamente.");
      window.setTimeout(() => setDetectionMessage(null), 4200);
      return;
    }
    const controller = new AbortController();
    samAbortRef.current?.abort();
    samAbortRef.current = controller;
    setSamMaskSession({ phase: "loading", click, frame, selectionMode: "point" });
    const startedAt = performance.now();
    try {
      const result = await segmentFrameAtPoint(frame, click, controller.signal);
      if (samAbortRef.current !== controller) return;
      const sample = buildSamPlayerSample(frame, result, currentTime, performance.now() - startedAt);
      if (!sample?.mask) throw new SamClientError("A máscara recebida está vazia ou desalinhada.", "INVALID_MASK", true);
      setSamMaskSession({
        phase: "review",
        click,
        frame,
        sample,
        selectionMode: "point",
        message: `Máscara alinhada · confiança ${Math.round(sample.confidence * 100)}% · confirme antes de guardar`,
      });
    } catch (error) {
      if (controller.signal.aborted || samAbortRef.current !== controller) return;
      const clientError = error instanceof SamClientError
        ? error
        : new SamClientError("Não foi possível concluir a identificação SAM 3.1.", "SAM_REQUEST_FAILED", true);
      setSamMaskSession({
        phase: "error",
        click,
        frame,
        selectionMode: "point",
        message: clientError.message,
        retryable: clientError.retryable,
      });
    } finally {
      if (samAbortRef.current === controller) samAbortRef.current = null;
    }
  };

  const startSamBoxIdentification = async (box: NormalizedBox) => {
    if (samMaskSession?.phase === "loading") return;
    const video = getVideoElement?.();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setDetectionMessage("O fotograma do vídeo ainda não está pronto.");
      window.setTimeout(() => setDetectionMessage(null), 2600);
      return;
    }
    video.pause();
    let frame: HTMLCanvasElement;
    try {
      frame = captureVideoFrame(video);
    } catch {
      setDetectionMessage("Não foi possível ler este fotograma. Confirme o CORS do vídeo Cloudflare R2 e tente novamente.");
      window.setTimeout(() => setDetectionMessage(null), 4200);
      return;
    }
    const controller = new AbortController();
    samAbortRef.current?.abort();
    samAbortRef.current = controller;
    setSamMaskSession({ phase: "loading", click: center, frame, selectionMode: "box", message: "A analisar o jogador dentro da caixa no fotograma original…" });
    const startedAt = performance.now();
    try {
      const result = await segmentFrameInBox(frame, box, controller.signal);
      if (samAbortRef.current !== controller) return;
      const sample = buildSamPlayerSample(frame, result, currentTime, performance.now() - startedAt);
      if (!sample?.mask) throw new SamClientError("A máscara recebida está vazia ou desalinhada.", "INVALID_MASK", true);
      setSamMaskSession({
        phase: "review",
        click: center,
        frame,
        sample,
        selectionMode: "box",
        message: `Máscara por caixa alinhada · confiança ${Math.round(sample.confidence * 100)}% · confirme antes de guardar`,
      });
    } catch (error) {
      if (controller.signal.aborted || samAbortRef.current !== controller) return;
      const clientError = error instanceof SamClientError
        ? error
        : new SamClientError("Não foi possível concluir a identificação SAM 3.1 por caixa.", "SAM_REQUEST_FAILED", true);
      setSamMaskSession({
        phase: "error",
        click: center,
        frame,
        selectionMode: "box",
        message: clientError.message,
        retryable: clientError.retryable,
      });
    } finally {
      if (samAbortRef.current === controller) samAbortRef.current = null;
    }
  };

  const confirmSamIdentification = () => {
    const session = samMaskSession;
    const sample = session?.sample;
    if (!session || !sample?.mask || session.phase !== "review") return;
    const track: PlayerTrack = {
      id: createId(),
      name: `Jogador ${(activeVideoContent?.playerTracks?.length ?? 0) + 1}`,
      source: "automatic",
      status: "ready",
      appearanceColor: sampleJerseyColor(session.frame, [
        sample.bbox.x * session.frame.width,
        sample.bbox.y * session.frame.height,
        sample.bbox.width * session.frame.width,
        sample.bbox.height * session.frame.height,
      ]),
      samples: [sample],
    };
    addPlayerTrack(track);
    const dimensions = playerRingDimensions(sample.bbox, width, height);
    makeDrawing(
      "identifyPlayer",
      { kind: "identifyPlayer", center: sample.foot, radiusX: dimensions.radiusX, radiusY: dimensions.radiusY },
      { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot }, trackingEnabled: false, keepTool: true },
    );
    setSamMaskSession({
      ...session,
      phase: "confirmed",
      trackId: track.id,
      trackingTrackIds: [track.id],
      message: `${track.name} · máscara guardada · tracking opcional`,
    });
  };

  const toggleSamTrackingPlayer = (candidateTrackId: string) => {
    setSamMaskSession((session) => {
      if (!session?.trackId || session.phase === "tracking") return session;
      const selected = new Set(session.trackingTrackIds?.length ? session.trackingTrackIds : [session.trackId]);
      // The just-confirmed player anchors this review panel and remains selected.
      if (candidateTrackId === session.trackId) selected.add(candidateTrackId);
      else if (selected.has(candidateTrackId)) selected.delete(candidateTrackId);
      else selected.add(candidateTrackId);
      return { ...session, trackingTrackIds: [...selected] };
    });
  };

  const startSingleSamTracking = async (trackingDuration: number) => {
    const session = samMaskSession;
    const sample = session?.sample;
    const trackId = session?.trackId;
    const video = getVideoElement?.();
    if (!session || !sample?.mask || !trackId || !video || session.phase === "tracking") return;
    const existing = activeVideoContent?.playerTracks?.find((track) => track.id === trackId)?.samTracking;
    const sourceStart = timelineTimeToSource(sample.time, activeFreezeFrames).sourceTime;
    if (existing?.frameTimes?.length && existing.duration >= trackingDuration && Math.abs(existing.sourceStartTime - sourceStart) < .04) {
      const startedAt = performance.now();
      const reused = existing.duration === trackingDuration
        ? existing
        : trimSamPlayerTracking(existing, trackingDuration, sourceTimeToTimeline(sourceStart + trackingDuration, activeFreezeFrames));
      if (reused !== existing) setPlayerSamTracking(trackId, reused);
      setSamMaskSession({
        ...session,
        phase: "tracked",
        trackingDuration,
        message: `${reused.frames.length} máscaras reutilizadas · sem preparar vídeo nem chamar a API`,
        performance: {
          totalMs: performance.now() - startedAt,
          clipPreparationMs: 0, clipCaptureMs: 0, clipFinalizeMs: 0, clipRestoreMs: 0,
          browserTransferMs: 0, requestParseMs: 0, metaUploadMs: 0, metaProcessingMs: 0,
          maskConversionMs: 0, clientConversionMs: 0, previewPreparationMs: 0, responseOverheadMs: 0,
          reusedClip: false, reusedTracking: true,
        },
      });
      return;
    }
    const controller = new AbortController();
    samAbortRef.current?.abort();
    samAbortRef.current = controller;
    setSamMaskSession({ ...session, phase: "tracking", trackingDuration, message: `A preparar e analisar ${trackingDuration} segundos na resolução original…` });
    const trackingStartedAt = performance.now();
    try {
      video.pause();
      const clip = await prepareSamTrackingClip(video, trackingDuration, sourceStart, controller.signal);
      setSamMaskSession((current) => current?.trackId === trackId && current.phase === "tracking"
        ? { ...current, message: clip.timings.reused ? "Excerto MP4 reutilizado · a iniciar pedido seguro…" : `Excerto preparado em ${(clip.timings.totalMs / 1_000).toFixed(2)} s · a enviar…` }
        : current);
      const bounds = sample.mask.bounds;
      const execution = await trackSamPlayer(clip, {
        point: {
          x: Math.max(0, Math.min(clip.width - 1, Math.floor(session.click.x * clip.width))),
          y: Math.max(0, Math.min(clip.height - 1, Math.floor(session.click.y * clip.height))),
        },
        bounds: {
          left: Math.max(0, Math.floor(bounds.x * clip.width)),
          top: Math.max(0, Math.floor(bounds.y * clip.height)),
          right: Math.min(clip.width, Math.ceil((bounds.x + bounds.width) * clip.width)),
          bottom: Math.min(clip.height, Math.ceil((bounds.y + bounds.height) * clip.height)),
        },
      }, {
        signal: controller.signal,
        onProgress: (progress) => setSamMaskSession((current) => current?.trackId === trackId && current.phase === "tracking"
          ? { ...current, message: trackingProgressMessage(progress) }
          : current),
      });
      if (samAbortRef.current !== controller) return;
      const conversionStartedAt = performance.now();
      const result = execution.result;
      const tracking = buildSamPlayerTracking(result, clip.sourceStartTime, sample.bbox, activeFreezeFrames, clip.sourceFrameTimes);
      if (!tracking.frames.length) throw new SamClientError("O jogador perdeu a identidade logo no início do intervalo. Repita a identificação noutro ponto do corpo.", "IDENTITY_LOST", true);
      setPlayerSamTracking(trackId, tracking);
      const clientConversionMs = performance.now() - conversionStartedAt;
      const server = result.timings;
      const requestParseMs = server?.requestParseMs ?? 0;
      const serverStreamMs = (server?.metaUploadMs ?? 0) + (server?.metaProcessingMs ?? 0) + (server?.maskConversionMs ?? 0);
      setSamMaskSession({
        ...session,
        phase: "tracked",
        trackingDuration,
        message: `${tracking.frames.length} máscaras sincronizadas · resultado pronto a reproduzir`,
        performance: {
          totalMs: performance.now() - trackingStartedAt,
          clipPreparationMs: clip.timings.preparationMs,
          clipCaptureMs: clip.timings.captureMs,
          clipFinalizeMs: clip.timings.finalizeMs,
          clipRestoreMs: clip.timings.restoreMs,
          browserTransferMs: Math.max(0, execution.timings.browserUploadMs - requestParseMs),
          requestParseMs,
          metaUploadMs: server?.metaUploadMs ?? 0,
          metaProcessingMs: server?.metaProcessingMs ?? 0,
          maskConversionMs: server?.maskConversionMs ?? 0,
          clientConversionMs,
          previewPreparationMs: 0,
          responseOverheadMs: Math.max(0, execution.timings.responseStreamMs - serverStreamMs),
          reusedClip: clip.timings.reused,
          reusedTracking: false,
        },
      });
    } catch (error) {
      if (controller.signal.aborted || samAbortRef.current !== controller) return;
      const message = error instanceof Error ? error.message : "Não foi possível concluir o tracking SAM 3.1.";
      setSamMaskSession({ ...session, phase: "confirmed", trackingDuration, message });
    } finally {
      if (samAbortRef.current === controller) samAbortRef.current = null;
    }
  };

  const startSamTracking = async (trackingDuration: number) => {
    const session = samMaskSession;
    const primarySample = session?.sample;
    const primaryTrackId = session?.trackId;
    const video = getVideoElement?.();
    if (!session || !primarySample?.mask || !primaryTrackId || !video || session.phase === "tracking") return;
    if (!isSupportedSamTrackingDuration(trackingDuration)) {
      setSamMaskSession({ ...session, message: `Escolha uma duração inteira entre 1 e ${MAX_SAM_TRACKING_SECONDS} segundos.` });
      return;
    }
    const selectedIds = [...new Set(session.trackingTrackIds?.length ? session.trackingTrackIds : [primaryTrackId])];
    if (selectedIds.length === 1) {
      await startSingleSamTracking(trackingDuration);
      return;
    }

    const sourceStart = timelineTimeToSource(primarySample.time, activeFreezeFrames).sourceTime;
    const works = selectedIds.flatMap((id) => {
      const track = activeVideoContent?.playerTracks?.find((candidate) => candidate.id === id);
      const sample = id === primaryTrackId
        ? primarySample
        : track?.samples.find((candidate) => Math.abs(candidate.time - primarySample.time) < .05 && candidate.mask);
      return track && sample?.mask ? [{ id, track, sample }] : [];
    });
    if (!works.length) {
      setSamMaskSession({ ...session, message: "Nenhum dos jogadores selecionados tem uma máscara confirmada neste fotograma." });
      return;
    }

    const controller = new AbortController();
    samAbortRef.current?.abort();
    samAbortRef.current = controller;
    const startedAt = performance.now();
    const completed: string[] = [];
    const failures: string[] = [];
    setSamMaskSession({ ...session, phase: "tracking", trackingDuration, message: `A preparar ${trackingDuration} s para ${works.length} jogadores…` });
    try {
      video.pause();
      const clip = await prepareSamTrackingClip(video, trackingDuration, sourceStart, controller.signal);
      let aggregate = {
        requestParseMs: 0, metaUploadMs: 0, metaProcessingMs: 0, maskConversionMs: 0,
        browserTransferMs: 0, responseOverheadMs: 0, clientConversionMs: 0,
      };
      for (let index = 0; index < works.length; index += 1) {
        if (controller.signal.aborted || samAbortRef.current !== controller) return;
        const { id, track, sample } = works[index];
        const existing = track.samTracking;
        if (existing?.frameTimes?.length && existing.duration >= trackingDuration && Math.abs(existing.sourceStartTime - sourceStart) < .04) {
          const reused = existing.duration === trackingDuration
            ? existing
            : trimSamPlayerTracking(existing, trackingDuration, sourceTimeToTimeline(sourceStart + trackingDuration, activeFreezeFrames));
          if (reused !== existing) setPlayerSamTracking(id, reused);
          completed.push(track.name);
          continue;
        }
        const bounds = sample.mask!.bounds;
        const seed = id === primaryTrackId
          ? session.click
          : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        setSamMaskSession((current) => current?.trackId === primaryTrackId && current.phase === "tracking"
          ? { ...current, message: `SAM 3.1 · jogador ${index + 1}/${works.length} · ${track.name}` }
          : current);
        try {
          const execution = await trackSamPlayer(clip, {
            point: {
              x: Math.max(0, Math.min(clip.width - 1, Math.floor(seed.x * clip.width))),
              y: Math.max(0, Math.min(clip.height - 1, Math.floor(seed.y * clip.height))),
            },
            bounds: {
              left: Math.max(0, Math.floor(bounds.x * clip.width)),
              top: Math.max(0, Math.floor(bounds.y * clip.height)),
              right: Math.min(clip.width, Math.ceil((bounds.x + bounds.width) * clip.width)),
              bottom: Math.min(clip.height, Math.ceil((bounds.y + bounds.height) * clip.height)),
            },
          }, {
            signal: controller.signal,
            onProgress: (progress) => setSamMaskSession((current) => current?.trackId === primaryTrackId && current.phase === "tracking"
              ? { ...current, message: `SAM 3.1 · jogador ${index + 1}/${works.length} · ${trackingProgressMessage(progress)}` }
              : current),
          });
          if (controller.signal.aborted || samAbortRef.current !== controller) return;
          const conversionStartedAt = performance.now();
          const tracking = buildSamPlayerTracking(execution.result, clip.sourceStartTime, sample.bbox, activeFreezeFrames, clip.sourceFrameTimes);
          if (!tracking.frames.length) throw new SamClientError("O jogador perdeu a identidade logo no início do intervalo.", "IDENTITY_LOST", true);
          setPlayerSamTracking(id, tracking);
          completed.push(track.name);
          const server = execution.result.timings;
          const requestParseMs = server?.requestParseMs ?? 0;
          const serverStreamMs = (server?.metaUploadMs ?? 0) + (server?.metaProcessingMs ?? 0) + (server?.maskConversionMs ?? 0);
          aggregate = {
            requestParseMs: aggregate.requestParseMs + requestParseMs,
            metaUploadMs: aggregate.metaUploadMs + (server?.metaUploadMs ?? 0),
            metaProcessingMs: aggregate.metaProcessingMs + (server?.metaProcessingMs ?? 0),
            maskConversionMs: aggregate.maskConversionMs + (server?.maskConversionMs ?? 0),
            browserTransferMs: aggregate.browserTransferMs + Math.max(0, execution.timings.browserUploadMs - requestParseMs),
            responseOverheadMs: aggregate.responseOverheadMs + Math.max(0, execution.timings.responseStreamMs - serverStreamMs),
            clientConversionMs: aggregate.clientConversionMs + performance.now() - conversionStartedAt,
          };
        } catch (error) {
          if (controller.signal.aborted) return;
          failures.push(`${track.name}: ${error instanceof Error ? error.message : "falhou"}`);
        }
      }
      if (!completed.length) throw new Error(failures[0] ?? "Não foi possível concluir o tracking SAM 3.1.");
      setSamMaskSession({
        ...session,
        phase: "tracked",
        trackingDuration,
        message: `${completed.length}/${works.length} jogadores sincronizados${failures.length ? ` · ${failures.length} falhou` : ""}`,
        performance: {
          totalMs: performance.now() - startedAt,
          clipPreparationMs: clip.timings.preparationMs,
          clipCaptureMs: clip.timings.captureMs,
          clipFinalizeMs: clip.timings.finalizeMs,
          clipRestoreMs: clip.timings.restoreMs,
          ...aggregate,
          previewPreparationMs: 0,
          reusedClip: clip.timings.reused,
          reusedTracking: false,
        },
      });
    } catch (error) {
      if (controller.signal.aborted || samAbortRef.current !== controller) return;
      const message = error instanceof Error ? error.message : "Não foi possível concluir o tracking SAM 3.1.";
      setSamMaskSession({ ...session, phase: "confirmed", trackingDuration, message });
    } finally {
      if (samAbortRef.current === controller) samAbortRef.current = null;
    }
  };

  const playSamTracking = async () => {
    const trackIds = samMaskSession?.trackingTrackIds?.length
      ? samMaskSession.trackingTrackIds
      : samMaskSession?.trackId ? [samMaskSession.trackId] : [];
    const video = getVideoElement?.();
    const trackings = (activeVideoContent?.playerTracks ?? [])
      .filter((track) => trackIds.includes(track.id))
      .flatMap((track) => track.samTracking ? [track.samTracking] : []);
    if (!video || !trackings.length) return;
    const sourceStartTime = Math.min(...trackings.map((tracking) => tracking.sourceStartTime));
    const sourceEndTime = Math.max(...trackings.map((tracking) => tracking.sourceStartTime + tracking.duration));
    video.currentTime = sourceStartTime;
    const stopAtEnd = () => {
      if (video.currentTime < sourceEndTime - .01) return;
      video.pause();
      video.removeEventListener("timeupdate", stopAtEnd);
    };
    video.addEventListener("timeupdate", stopAtEnd);
    try { await video.play(); }
    catch { setDetectionMessage("O browser bloqueou a reprodução automática. Prima Play no vídeo."); }
  };

  const createApproximateRingForPlayer = (foot: Point, replacementId?: string) => {
    const boxHeight = clamp(.035 + foot.y * .1, .045, .15);
    const boxWidth = boxHeight * .42 * height / Math.max(1, width);
    const bbox: NormalizedBox = {
      x: clamp(foot.x - boxWidth / 2, 0, 1 - boxWidth),
      y: clamp(foot.y - boxHeight * .94, 0, 1 - boxHeight),
      width: boxWidth,
      height: boxHeight,
    };
    const track: PlayerTrack = {
      id: createId(),
      name: `Jogador ${drawings.filter((item) => item.target?.kind === "player").length + 1}`,
      source: "manual",
      status: "ready",
      samples: [{ time: currentTime, bbox, foot, confidence: .18 }],
    };
    addPlayerTrack(track);
    const identified = { track, sample: track.samples[0] };
    if (replacementId) replaceRingPlayer(replacementId, identified);
    else createRingForPlayer(identified);
    return identified;
  };

  const identifyPlayerAtClick = async (click: Point, mode: "ring" | "ringReidentify" | "identify" | "identifyKeepTool" = "ring"): Promise<IdentifiedPlayer | null> => {
    if (detectingPlayer) return null;
    const replacingRingId = mode === "ringReidentify" ? ringReidentifyId : null;
    const replacedTrackId = replacingRingId ? drawings.find((drawing) => drawing.id === replacingRingId)?.target?.trackId : null;
    const showIdentificationAnimation = mode === "identify" || mode === "identifyKeepTool";
    const existingTrack = [...(activeVideoContent?.playerTracks ?? [])].reverse()
      .filter((track) => track.id !== replacedTrackId && track.samples.length)
      .map((track) => ({ track, sample: samplePlayerTrackAtTime(track, currentTime) }))
      .filter(({ sample }) => Math.abs(sample.time - currentTime) < .05 && (mode === "ring" || mode === "ringReidentify" ? isNearPlayerFeet(sample.bbox, click) : containsPoint(sample.bbox, click)))
      .sort((left, right) => {
        const leftDistance = Math.hypot((left.sample.foot.x - click.x) * width, (left.sample.foot.y - click.y) * height);
        const rightDistance = Math.hypot((right.sample.foot.x - click.x) * width, (right.sample.foot.y - click.y) * height);
        return leftDistance - rightDistance;
      })[0]?.track;
    if (existingTrack) {
      const identified = { track: existingTrack, sample: samplePlayerTrackAtTime(existingTrack, currentTime) };
      if (showIdentificationAnimation) setDetectionEffect({ phase: "locked", click, box: identified.sample.bbox, score: identified.sample.confidence });
      setDetectionMessage(`${existingTrack.name} reconhecido neste fotograma`);
      if (mode === "ring") createRingForPlayer(identified);
      else if (mode === "ringReidentify" && replacingRingId) replaceRingPlayer(replacingRingId, identified);
      else if (mode === "identify") setTool("select");
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 1200);
      return identified;
    }

    const video = getVideoElement?.();
    if (showIdentificationAnimation) setDetectionEffect({ phase: "scanning", click });
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setDetectionMessage("O fotograma do vídeo ainda não está pronto.");
      if (showIdentificationAnimation) setDetectionEffect({ phase: "failed", click });
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 2600);
      return null;
    }

    video.pause();
    setDetectingPlayer(true);
    setDetectionMessage("A capturar o fotograma na resolução original…");
    try {
      const frame = captureVideoFrame(video);
      setDetectionMessage("A analisar regiões de alta resolução à volta do clique…");
      const clickAnchor = mode === "ring" || mode === "ringReidentify" ? "feet" : "body";
      const { match, boxes, usedFullFrame } = await detectPlayerAtPoint(frame, click, clickAnchor);
      if (usedFullFrame) setDetectionMessage("A confirmar o jogador no fotograma completo…");
      setDetectionMessage(match ? "A criar o contorno individual do jogador…" : "A tentar segmentar diretamente o ponto selecionado…");
      const segmented = await segmentPlayerAtPoint(
        frame,
        click,
        match?.box,
        match?.detection.score ?? .2,
        currentTime,
        { clickAnchor },
      ).catch(() => null);

      if (!match && !segmented) {
        setDetectionBoxes([]);
        if (mode === "ring" || mode === "ringReidentify") {
          const identified = createApproximateRingForPlayer(click, replacingRingId ?? undefined);
          setDetectionMessage("Ring colocado nos pés. Não foi possível isolar a silhueta, por isso pode ajustá-lo manualmente.");
          window.setTimeout(() => { setDetectionMessage(null); setDetectionBoxes([]); setDetectionEffect(null); }, 4200);
          return identified;
        } else {
          setDetectionEffect({ phase: "failed", click });
          setDetectionMessage(boxes.length
            ? "Não consegui isolar esse jogador. Tente clicar no centro do tronco."
            : "O jogador é demasiado pequeno ou não tem píxeis suficientes para criar um contorno fiável.");
        }
        window.setTimeout(() => { setDetectionMessage(null); setDetectionBoxes([]); setDetectionEffect(null); }, 4200);
        return null;
      }

      const box = segmented?.bbox ?? match!.box;
      const confidence = segmented?.confidence ?? match!.detection.score;
      const detectedFoot = segmented?.foot ?? { x: box.x + box.width / 2, y: box.y + box.height };
      const maximumFootShiftX = Math.max(box.width * .65, 10 / Math.max(1, frame.width));
      const maximumFootShiftY = Math.max(box.height * .16, 7 / Math.max(1, frame.height));
      const foot = clickAnchor === "feet" ? {
        x: clamp(click.x + clamp(detectedFoot.x - click.x, -maximumFootShiftX, maximumFootShiftX), 0, 1),
        y: clamp(click.y + clamp(detectedFoot.y - click.y, -maximumFootShiftY, maximumFootShiftY), 0, 1),
      } : detectedFoot;
      if (showIdentificationAnimation) setDetectionEffect({ phase: "locked", click, box, score: confidence });
      setDetectionMessage(segmented
        ? segmented.mask.quality < .5
          ? `Jogador segmentado · qualidade ${Math.round(segmented.mask.quality * 100)}% · detalhe limitado pelos píxeis do vídeo`
          : `Jogador segmentado · qualidade ${Math.round(segmented.mask.quality * 100)}%`
        : `Jogador identificado · ${Math.round(confidence * 100)}% · contorno aproximado`);
      await wait(220);

      const { radiusX, radiusY } = playerRingDimensions(box, width, height);
      const track: PlayerTrack = {
        id: createId(),
        name: `Jogador ${drawings.filter((item) => item.target?.kind === "player").length + 1}`,
        source: match ? "automatic" : "manual",
        status: "ready",
        appearanceColor: sampleJerseyColor(frame, [box.x * frame.width, box.y * frame.height, box.width * frame.width, box.height * frame.height]),
        samples: [{ time: currentTime, bbox: box, foot, confidence, mask: segmented?.mask }],
      };
      addPlayerTrack(track);
      if (mode === "ring") {
        createRingForPlayer({ track, sample: track.samples[0] });
      } else if (mode === "ringReidentify" && replacingRingId) {
        replaceRingPlayer(replacingRingId, { track, sample: track.samples[0] });
      } else {
        makeDrawing(
          "identifyPlayer",
          { kind: "identifyPlayer", center: foot, radiusX: Math.max(radiusX * .72, .025), radiusY: Math.max(radiusY * .72, .01) },
          { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: foot }, trackingEnabled: false, keepTool: mode === "identifyKeepTool" },
        );
        if (mode === "identify") setTool("select");
      }
      setDetectionBoxes([]);
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 1500);
      return { track, sample: track.samples[0] };
    } catch {
      setDetectionBoxes([]);
      if (mode === "ring" || mode === "ringReidentify") {
        const identified = createApproximateRingForPlayer(click, replacingRingId ?? undefined);
        setDetectionMessage("Ring colocado no ponto clicado. Pode movê-lo e redimensioná-lo manualmente.");
        window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 4200);
        return identified;
      } else {
        setDetectionEffect({ phase: "failed", click });
        setDetectionMessage("Não foi possível analisar este fotograma. Confirme o acesso ao vídeo e tente novamente.");
      }
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 4200);
      return null;
    } finally {
      setDetectingPlayer(false);
    }
  };

  const placeRingOnPlayer = async (click: Point, mode: "ring" | "identify" | "identifyKeepTool" = "ring"): Promise<IdentifiedPlayer | null> => {
    if (detectingPlayer) return null;
    const existingTrack = [...(activeVideoContent?.playerTracks ?? [])].reverse().find((track) => {
      if (!track.samples.length) return false;
      const sample = samplePlayerTrackAtTime(track, currentTime);
      return Math.abs(sample.time - currentTime) < .05 && containsPoint(sample.bbox, click);
    });
    if (existingTrack) {
      const identified = { track: existingTrack, sample: samplePlayerTrackAtTime(existingTrack, currentTime) };
      setDetectionEffect({ phase: "locked", click, box: identified.sample.bbox, score: identified.sample.confidence });
      setDetectionMessage(`${existingTrack.name} reconhecido`);
      if (mode === "ring") createRingForPlayer(identified);
      else if (mode === "identify") setTool("select");
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 1200);
      return identified;
    }
    setDetectionEffect({ phase: "scanning", click });
    const video = getVideoElement?.();
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setDetectionMessage("O fotograma do vídeo ainda não está pronto.");
      setDetectionEffect({ phase: "failed", click });
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 2600);
      return null;
    }

    video.pause();
    setDetectingPlayer(true);
    setDetectionMessage("A analisar a zona selecionada…");
    try {
      const result = await detectPlayerAtPoint(captureVideoFrame(video), click);
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
        return null;
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
        "identifyPlayer",
        { kind: "identifyPlayer", center: foot, radiusX: Math.max(radiusX * .72, .025), radiusY: Math.max(radiusY * .72, .01) },
        { target: { kind: "player", trackId, anchor: "feet", referenceFoot: foot }, trackingEnabled: true, keepTool: true },
      );
      setPlayerTrackStatus(trackId, "processing");
      if (mode === "ring") createRingForPlayer({ track, sample: track.samples[0] });
      else if (mode === "identify") setTool("select");
      setDetectionBoxes([]);
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 1500);
      return { track, sample: track.samples[0] };
    } catch {
      setDetectionBoxes([]);
      setDetectionEffect({ phase: "failed", click });
      setDetectionMessage("Não foi possível analisar este fotograma. Confirme o acesso ao vídeo e tente novamente.");
      window.setTimeout(() => { setDetectionMessage(null); setDetectionEffect(null); }, 4200);
      return null;
    } finally {
      setDetectingPlayer(false);
    }
  };

  const placeSpotlightOnPlayer = async (click: Point) => {
    const identified = await selectSavedPlayerAtClick(click, "spotlight");
    if (!identified) return;
    const { track, sample } = identified;
    makeDrawing("spotlight", {
      kind: "spotlight",
      target: sample.foot,
      radiusX: clamp(sample.bbox.width * 1.65, .035, .11),
      radiusY: clamp(sample.bbox.width * .42, .012, .035),
      beamHeight: clamp(sample.bbox.height * 1.18, .12, .42),
      design: "beam",
      darkness: .68,
      feather: .48,
    }, { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot } });
  };

  const placeGhost = async (point: Point) => {
    if (pendingGhost) {
      const { track, sample } = pendingGhost;
      makeDrawing("ghost", {
        kind: "ghost",
        origin: sample.foot,
        destination: point,
        radiusX: Math.max(.008, sample.bbox.width / 2),
        radiusY: Math.max(.02, sample.bbox.height / 2),
        hideOriginal: true,
        playerOpacity: .96,
        showArrow: true,
        showOrigin: false,
        animateMovement: true,
        returnToOrigin: true,
        travelDuration: .7,
      }, { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot } });
      setPendingGhost(null);
      return;
    }
    const identified = await selectSavedPlayerAtClick(point, "ghost");
    if (!identified) return;
    setPendingGhost(identified);
    setDetectionMessage("Jogador recortado · clique na nova posição");
  };

  useEffect(() => {
    if (tool === "ghost") return;
    const timer = window.setTimeout(() => setPendingGhost(null), 0);
    return () => window.clearTimeout(timer);
  }, [tool]);

  // Static-frame identification only. Legacy tracking data can still be
  // rendered, but no detector is started while the video plays.
  const trackingEnabledForSession: boolean = false;
  const activeTrackingDrawing = [...drawings].reverse().find((drawing) => trackingEnabledForSession && drawing.trackingEnabled && drawing.target?.kind === "player");
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

  const stopActiveTracking = () => {
    if (!activeTrackingDrawing || activeTrackingDrawing.target?.kind !== "player") return;
    updateDrawing(activeTrackingDrawing.id, {
      trackingEnabled: false,
      endTime: Math.max(activeTrackingDrawing.startTime + .04, currentTime),
    });
    setPlayerTrackStatus(activeTrackingDrawing.target.trackId, "ready");
    setTrackingQuality(null);
  };

  const lineAnchorAtPoint = (point: Point) => {
    const candidates = (activeVideoContent?.playerTracks ?? [])
      .filter((track) => track.samples.length)
      .map((track) => ({ track, sample: samplePlayerTrackAtTime(track, currentTime) }));
    const direct = [...candidates].reverse().find(({ sample }) => containsPoint(sample.bbox, point));
    const nearby = direct ?? candidates
      .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.sample.foot.x - point.x, candidate.sample.foot.y - point.y) }))
      .filter((candidate) => candidate.distance <= .035)
      .sort((left, right) => left.distance - right.distance)[0];
    if (!nearby) return null;
    const groundPoint = playerGroundPoint(nearby.sample);
    return {
      point: groundPoint,
      target: { kind: "player", trackId: nearby.track.id, anchor: "feet", referenceFoot: groundPoint } as DrawingTarget,
    };
  };

  const polygonPointAt = (point: Point, points: Point[]) => points.findIndex((candidate) =>
    Math.hypot((candidate.x - point.x) * width, (candidate.y - point.y) * height) <= 13,
  );

  const finishLineDraft = useCallback((lineDraft: Draft) => {
    if (lineDraft.tool !== "line" || lineDraft.points.length < 2) return;
    makeDrawing("line", {
      kind: "line",
      points: lineDraft.points,
      lineDesign: "single",
      secondaryColor: "#ffffff",
      startTarget: lineDraft.pointTargets?.[0] ?? lineDraft.startTarget,
      endTarget: lineDraft.pointTargets?.at(-1) ?? undefined,
      pointTargets: lineDraft.pointTargets,
    });
  }, [makeDrawing]);

  useEffect(() => {
    if (!draft && !samBoxDraft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft(null);
        setSamBoxDraft(null);
      }
      if (event.key === "Enter" && draft?.tool === "line" && draft.points.length >= 2) {
        event.preventDefault();
        finishLineDraft(draft);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, finishLineDraft, samBoxDraft]);

  const onPointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (event.target !== event.target.getStage()) return;
    const point = pointFromStage(event.target.getStage()!);
    if (!point) return;
    if (tool === "select") { setSelectedId(null); return; }
    if (tool === "identifyPlayer") {
      return;
    }
    if (tool === "sam31") {
      if (samSelectionMode === "box") {
        getVideoElement?.()?.pause();
        setSamBoxDraft({ start: point, current: point });
      } else {
        void startSamIdentification(point);
      }
      return;
    }
    if (tool === "playerRing") {
      void selectSavedPlayerAtClick(point, ringReidentifyId ? "ringReidentify" : "ring");
      return;
    }
    if (tool === "ghost") {
      void placeGhost(point);
      return;
    }
    if (tool === "spotlight") {
      void placeSpotlightOnPlayer(point);
      return;
    }
    if (tool === "zoom") {
      makeDrawing("zoom", { kind: "zoom", center: point, radius: .14, zoom: 2 });
      return;
    }
    if (tool === "playerLabel") {
      makeDrawing("playerLabel", {
        kind: "playerLabel",
        anchor: point,
        labelOffsetY: .12,
        label: { visible: true, number: "", position: "", name: "JOGADOR", color: "#ffffff", fontSize: .032 },
      });
      return;
    }
    if (tool === "text") {
      makeDrawing("text", {
        kind: "text",
        origin: point,
        text: "TEXTO",
        fontSize: 0.055,
        // New labels start with the same crisp, pitch-aligned treatment used in
        // tactical video examples. Older drawings preserve their original preset.
        textDesign: "pitchTactical",
        fontFamily: "condensed",
        letterSpacing: .012,
        pitchScaleY: .64,
        groundTilt: -10,
        groundDepth: 7,
      });
      return;
    }
    if (tool === "triangle" || tool === "polygon") {
      const existingPoints = draft?.tool === tool ? draft.points : [];
      if (tool === "polygon" && existingPoints.length >= 3) {
        const closingIndex = polygonPointAt(point, existingPoints);
        if (closingIndex >= 0) {
          const points = [...existingPoints.slice(closingIndex), ...existingPoints.slice(0, closingIndex)];
          makeDrawing("polygon", { kind: "polygon", points, zoneDesign: "solid", stripeColor: "#ffffff", stripeSpacing: .014, stripeAngle: 58, stripeOpacity: .72 });
          return;
        }
      }
      if (tool === "polygon" && polygonPointAt(point, existingPoints) >= 0) return;
      const points = [...existingPoints, point];
      if (tool === "triangle" && points.length === 3) {
        makeDrawing("triangle", { kind: "triangle", points, fillDesign: "solid", stripeColor: "#ffffff", stripeSpacing: .014, stripeAngle: 58, stripeOpacity: .72 });
      } else {
        setDraft({ tool, start: points[0], points, current: point });
      }
      return;
    }

    if (tool === "line") {
      const anchor = lineAnchorAtPoint(point);
      const nextPoint = anchor?.point ?? point;
      if (draft?.tool === "line") {
        const lastPoint = draft.points.at(-1)!;
        const repeatsLastPoint = Math.hypot((lastPoint.x - nextPoint.x) * width, (lastPoint.y - nextPoint.y) * height) <= 8;
        const points = repeatsLastPoint ? draft.points : [...draft.points, nextPoint];
        const pointTargets = repeatsLastPoint
          ? draft.pointTargets ?? []
          : [...(draft.pointTargets ?? []), anchor?.target ?? null];
        if ((event.evt.detail >= 2 || repeatsLastPoint) && points.length >= 2) {
          finishLineDraft({ ...draft, points, pointTargets, current: nextPoint });
        } else {
          setDraft({ ...draft, points, pointTargets, current: nextPoint });
        }
        return;
      }
      setDraft({ tool, start: nextPoint, points: [nextPoint], current: nextPoint, startTarget: anchor?.target, pointTargets: [anchor?.target ?? null] });
      return;
    }

    if (["ellipse", "rectangle", "arrow", "longBallArrow", "glimpse"].includes(tool) && draft?.tool === tool) {
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
        fillDesign: "solid",
        stripeColor: "#ffffff",
        stripeSpacing: .014,
        stripeAngle: 58,
        stripeOpacity: .72,
      });
      if (tool === "arrow") makeDrawing("arrow", { kind: "arrow", points: [draft.start, point], arrowDesign: "broadcast" });
      if (tool === "longBallArrow") makeDrawing("longBallArrow", { kind: "longBallArrow", start: draft.start, end: point, curveHeight: .13, showLandingZone: false, landingZoneColor: "#65d9ff", landingZoneSize: 1 });
      if (tool === "glimpse") makeDrawing("glimpse", { kind: "glimpse", origin: draft.start, target: point, spread: 38 });
      return;
    }
    setDraft({ tool, start: point, points: [point], current: point });
  };

  const onPointerMove = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (tool === "sam31" && samSelectionMode === "box" && samBoxDraft) {
      const point = pointFromStage(event.target.getStage()!);
      if (point) setSamBoxDraft({ ...samBoxDraft, current: point });
      return;
    }
    if (!draft || draft.tool !== tool || tool === "select" || tool === "text") return;
    const point = pointFromStage(event.target.getStage()!);
    if (!point) return;
    if (tool === "freeDraw") setDraft({ ...draft, points: [...draft.points, point], current: point });
    else if (tool === "line") setDraft({ ...draft, current: lineAnchorAtPoint(point)?.point ?? point });
    else if (tool === "polygon" && draft.points.length >= 3) {
      const snapIndex = polygonPointAt(point, draft.points);
      setDraft({ ...draft, current: snapIndex >= 0 ? draft.points[snapIndex] : point });
    } else setDraft({ ...draft, current: point });
  };

  const onPointerUp = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (tool === "sam31" && samSelectionMode === "box" && samBoxDraft) {
      const release = pointFromStage(event.target.getStage()!) ?? samBoxDraft.current;
      const box = {
        x: Math.min(samBoxDraft.start.x, release.x),
        y: Math.min(samBoxDraft.start.y, release.y),
        width: Math.abs(release.x - samBoxDraft.start.x),
        height: Math.abs(release.y - samBoxDraft.start.y),
      };
      setSamBoxDraft(null);
      if (box.width * width < 8 || box.height * height < 8) {
        setDetectionMessage("Desenhe uma caixa completa à volta do jogador.");
        window.setTimeout(() => setDetectionMessage(null), 2200);
        return;
      }
      void startSamBoxIdentification(box);
      return;
    }
    if (draft?.tool === "freeDraw" && tool === "freeDraw" && draft.points.length > 1) {
      makeDrawing("freeDraw", { kind: "freeDraw", points: draft.points });
    }
  };

  const handleSamPreviewPrepared = useCallback((metrics: { durationMs: number; frameCount: number }) => {
    setSamMaskSession((current) => {
      if (current?.phase !== "tracked" || !current.performance || current.performance.previewPreparationMs > 0) return current;
      return {
        ...current,
        performance: {
          ...current.performance,
          previewPreparationMs: metrics.durationMs,
          totalMs: current.performance.totalMs + metrics.durationMs,
        },
      };
    });
  }, []);

  const preview = (() => {
    if (!draft || draft.tool !== tool) return null;
    const style = { stroke: DEFAULT_STYLE.stroke, strokeWidth: DEFAULT_STYLE.strokeWidth, dash: [7, 6], opacity: 0.9 };
    if (tool === "ellipse") return <Ellipse listening={false} {...style} stroke="#65d9ff" fill="#65d9ff47" strokeWidth={0} shadowColor="#65d9ff" shadowBlur={12} shadowOpacity={.48} x={(draft.start.x + draft.current.x) / 2 * width} y={(draft.start.y + draft.current.y) / 2 * height} radiusX={Math.abs(draft.current.x - draft.start.x) / 2 * width} radiusY={Math.abs(draft.current.y - draft.start.y) / 2 * height} />;
    if (tool === "rectangle") return <Rect listening={false} {...style} x={Math.min(draft.start.x, draft.current.x) * width} y={Math.min(draft.start.y, draft.current.y) * height} width={Math.abs(draft.current.x - draft.start.x) * width} height={Math.abs(draft.current.y - draft.start.y) * height} />;
    if (tool === "arrow") {
      const geometry = buildPolylineArrowGeometry(flattenPoints([draft.start, draft.current], width, height), 7);
      if (!geometry.polygon.length) return null;
      const shadowPoints = geometry.polygon.map((value, index) => value + (index % 2 === 0 ? 4 : 7));
      return (
        <Group listening={false} opacity={.92}>
          <Line points={shadowPoints} closed fill="#000000" opacity={.34} shadowColor="#000000" shadowBlur={7} shadowOpacity={.45} />
          <Line points={geometry.polygon} closed fill="#65d9ff" lineJoin="round" />
        </Group>
      );
    }
    if (tool === "longBallArrow") {
      const start = { x: draft.start.x * width, y: draft.start.y * height };
      const end = { x: draft.current.x * width, y: draft.current.y * height };
      const control = automaticLongBallControl(start, end, .13, height);
      const renderScale = Math.max(.45, Math.min(3, Math.min(width / 960, height / 540)));
      const bodyWidth = 6 * renderScale;
      const geometry = buildCurvedArrowGeometry({ start, control, end, bodyWidth, renderScale });
      const groundControl = automaticLongBallControl(start, end, .008, height);
      const groundGeometry = buildCurvedArrowGeometry({ start, control: groundControl, end, bodyWidth: bodyWidth * .9, renderScale });
      const shadowPoints = groundGeometry.polygon.map((value, index) => value + (index % 2 === 0 ? 2 * renderScale : 4 * renderScale));
      return (
        <Group listening={false} opacity={.92}>
          <Line points={shadowPoints} closed fill="#000000" opacity={.34} shadowColor="#000000" shadowBlur={7 * renderScale} shadowOpacity={.45} />
          <Line points={geometry.polygon} closed fill="#65d9ff" lineJoin="round" />
        </Group>
      );
    }
    if (tool === "line") return <Line listening={false} stroke="#65d9ff" strokeWidth={6} dash={[7, 6]} opacity={.9} shadowColor="#000000" shadowBlur={2} shadowOpacity={.12} shadowOffsetX={0} shadowOffsetY={1} lineCap="round" lineJoin="round" points={flattenPoints([...draft.points, draft.current], width, height)} />;
    if (tool === "glimpse") {
      const originX = draft.start.x * width;
      const originY = draft.start.y * height;
      const deltaX = (draft.current.x - draft.start.x) * width;
      const deltaY = (draft.current.y - draft.start.y) * height;
      const length = Math.max(12, Math.hypot(deltaX, deltaY));
      const spread = 38;
      return <Arc listening={false} x={originX} y={originY} innerRadius={0} outerRadius={length} angle={spread} rotation={Math.atan2(deltaY, deltaX) * 180 / Math.PI - spread / 2} fillRadialGradientStartPoint={{ x: 0, y: 0 }} fillRadialGradientEndPoint={{ x: 0, y: 0 }} fillRadialGradientStartRadius={0} fillRadialGradientEndRadius={length} fillRadialGradientColorStops={[0, "rgba(255,255,255,.5)", .55, "rgba(255,255,255,.2)", 1, "rgba(255,255,255,0)"]} />;
    }
    if (tool === "freeDraw") return <Line listening={false} {...style} points={flattenPoints(draft.points, width, height)} tension={0.35} />;
    if (tool === "triangle" || tool === "polygon") return <Line listening={false} {...style} points={flattenPoints([...draft.points, draft.current], width, height)} closed={tool === "triangle" && draft.points.length === 2} />;
    return null;
  })();

  const visible = drawings.filter((drawing) => getObjectStateAtTime(drawing, currentTime).visible
    && targetAvailableAtTime(drawing, activeVideoContent?.playerTracks, currentTime));

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
    >
      <Layer>
        {samBoxDraft && tool === "sam31" && (
          <Rect
            listening={false}
            x={Math.min(samBoxDraft.start.x, samBoxDraft.current.x) * width}
            y={Math.min(samBoxDraft.start.y, samBoxDraft.current.y) * height}
            width={Math.abs(samBoxDraft.current.x - samBoxDraft.start.x) * width}
            height={Math.abs(samBoxDraft.current.y - samBoxDraft.start.y) * height}
            stroke="#a3ff12"
            strokeWidth={2}
            dash={[8, 5]}
            fill="#a3ff1214"
            shadowColor="#a3ff12"
            shadowBlur={8}
            shadowOpacity={.55}
          />
        )}
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
            editingPreview={!isPlaying}
            targetOffset={targetOffsetAtTime(object, activeVideoContent?.playerTracks, currentTime)}
            playerTracks={activeVideoContent?.playerTracks}
            allDrawings={drawings}
            onTransformPreview={object.data.kind === "ghost" ? (transform) => setGhostTransformPreview((current) => {
              if (transform) return { ...current, [object.id]: transform };
              const next = { ...current };
              delete next[object.id];
              return next;
            }) : undefined}
          />
        ))}
        {preview}
        {draft && (tool === "polygon" || tool === "triangle") && draft.points.map((point, index) => (
          <Ellipse
            listening={false}
            key={index}
            x={point.x * width}
            y={point.y * height}
            radiusX={tool === "polygon" && draft.points.length >= 3 && polygonPointAt(draft.current, [point]) === 0 ? 6 : 4}
            radiusY={tool === "polygon" && draft.points.length >= 3 && polygonPointAt(draft.current, [point]) === 0 ? 6 : 4}
            fill={tool === "polygon" && draft.points.length >= 3 && polygonPointAt(draft.current, [point]) === 0 ? "#a3ff12" : "#fff"}
          />
        ))}
        {tool === "text" && <Text text="Clique para adicionar texto" x={16} y={16} fill="#fff" opacity={0.5} fontSize={13} />}
        {tool === "line" && <Text text="Clique nos jogadores/pontos · duplo clique ou Enter para terminar" x={16} y={16} fill="#fff" opacity={0.68} fontSize={13} />}
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
      transformOverrides={ghostTransformPreview}
      editingPreview={!isPlaying}
    />
    <SamTrackingOverlayCanvas playerTracks={activeVideoContent?.playerTracks} width={width} height={height} getVideoElement={getVideoElement} onPrepared={handleSamPreviewPrepared} />
    <ZoomLensCanvas ref={zoomCanvasRef} drawings={drawings} currentTime={currentTime} width={width} height={height} getVideoElement={getVideoElement} editingPreview={!isPlaying} />
    <PlayerLabelOverlay drawings={drawings} playerTracks={activeVideoContent?.playerTracks} currentTime={currentTime} width={width} height={height} editingPreview={!isPlaying} />
    {tool === "sam31" && !samMaskSession && (
      <div className="sam-selection-mode" onPointerDown={(event) => event.stopPropagation()}>
        <div>
          <strong>SAM 3.1</strong>
          <small>{samSelectionMode === "box" ? "Arraste uma caixa à volta do corpo completo" : "Clique no centro do jogador"}</small>
        </div>
        <div className="sam-selection-mode-actions">
          <button
            type="button"
            className={samSelectionMode === "point" ? "active" : ""}
            onClick={() => { setSamBoxDraft(null); setSamSelectionMode("point"); }}
          >Identificar por clique</button>
          <button
            type="button"
            className={samSelectionMode === "box" ? "active" : ""}
            onClick={() => { setSamBoxDraft(null); setSamSelectionMode("box"); }}
          >Selecionar por caixa</button>
        </div>
      </div>
    )}
    {tool === "identifyPlayer" && manualMaskSession && (
      <ManualPlayerMaskEditor
        width={width}
        height={height}
        frameWidth={manualMaskSession.frame.width}
        frameHeight={manualMaskSession.frame.height}
        initialMask={manualMaskSession.track?.samples.find((sample) => Math.abs(sample.time - manualMaskSession.frameTime) < .05)?.mask}
        initialName={manualMaskSession.initialName}
        onCancel={() => {
          setManualMaskSession(null);
          cancelPlayerMaskEdit();
          setTool("select");
        }}
        onConfirm={saveManualMask}
      />
    )}
    {tool === "sam31" && samMaskSession && (
      <SamMaskReview
        phase={samMaskSession.phase}
        click={samMaskSession.click}
        sample={samMaskSession.sample}
        message={samMaskSession.message}
        retryable={samMaskSession.retryable}
        performance={samMaskSession.performance}
        onConfirm={confirmSamIdentification}
        onCancel={cancelSamIdentification}
        onCancelTracking={cancelSamTracking}
        onRepeat={repeatSamIdentification}
        onTrack={startSamTracking}
        onPlay={playSamTracking}
        trackingCandidates={samTrackingCandidates}
        selectedTrackingIds={samMaskSession.trackingTrackIds ?? (samMaskSession.trackId ? [samMaskSession.trackId] : [])}
        primaryTrackingId={samMaskSession.trackId}
        onToggleTrackingPlayer={toggleSamTrackingPlayer}
      />
    )}
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
