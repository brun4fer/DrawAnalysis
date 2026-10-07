"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Arc, Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from "react-konva";
import { detectPlayers } from "@/lib/playerDetector";
import { useEditorStore } from "@/store/useEditorStore";
import type { DrawingData, DrawingObject, DrawingTarget, NormalizedBox, ObjectTransform, PlayerTrack, Point, Tool } from "@/types/drawing";
import { DEFAULT_STYLE, DEFAULT_TRANSFORM } from "@/types/drawing";
import { flattenPoints, toNormalized } from "@/utils/coordinates";
import { createId } from "@/utils/id";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { timelineTimeToSource } from "@/utils/videoTimeline";
import { samplePlayerTrackAtTime, targetOffsetAtTime } from "@/utils/playerTracking";
import { applyFavoriteData } from "@/utils/toolFavorites";
import { DrawingShape } from "./DrawingShape";
import { PlayerOcclusionCanvas } from "./PlayerOcclusionCanvas";
import { PlayerLabelOverlay } from "./PlayerLabelOverlay";
import { ZoomLensCanvas } from "./ZoomLensCanvas";

interface Props {
  width: number;
  height: number;
  registerCapture?: (capture: (() => HTMLCanvasElement | null) | null) => void;
  getVideoElement?: () => HTMLVideoElement | null;
}

interface Draft { tool: Tool; start: Point; points: Point[]; current: Point; startTarget?: DrawingTarget }
interface DetectionEffect { phase: "scanning" | "locked" | "failed"; click: Point; box?: NormalizedBox; score?: number }
interface IdentifiedPlayer { track: PlayerTrack; sample: PlayerTrack["samples"][number] }

const labelFor = (kind: DrawingObject["type"]) => ({
  identifyPlayer: "Jogador", playerRing: "Ring", ghost: "Ghost", spotlight: "Spotlight", zoom: "Zoom", ellipse: "Marcador", arrow: "Seta", longBallArrow: "Bola longa", line: "Linha", glimpse: "Visão", triangle: "Triângulo",
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
    tool, drawings, selectedId, currentTime, duration, isPlaying, slides, selectedSlideId, favorites, activeFavoriteId,
    addDrawing, addPlayerTrack, appendPlayerTrackingSample, setPlayerTrackStatus,
    updateDrawing, setSelectedId, setTool,
  } = useEditorStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [detectionBoxes, setDetectionBoxes] = useState<NormalizedBox[]>([]);
  const [detectionEffect, setDetectionEffect] = useState<DetectionEffect | null>(null);
  const [detectingPlayer, setDetectingPlayer] = useState(false);
  const [pendingGhost, setPendingGhost] = useState<IdentifiedPlayer | null>(null);
  const [ghostTransformPreview, setGhostTransformPreview] = useState<Record<string, ObjectTransform>>({});
  const [trackingQuality, setTrackingQuality] = useState<"tracking" | "reacquiring" | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const occlusionCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
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
    options?: { target?: DrawingObject["target"]; trackingEnabled?: boolean; keepTool?: boolean },
  ) => {
    const count = drawings.filter((item) => item.type === type).length + 1;
    const actionCount = drawings.filter((item) => ["line", "arrow", "longBallArrow"].includes(item.type)).length + 1;
    const effectStyle = type === "identifyPlayer"
      ? { stroke: "#a3ff12", fill: "#a3ff1210", strokeWidth: 2, shadowColor: "#a3ff12", shadowBlur: 9, shadowOpacity: .5 }
      : type === "playerRing"
      ? { stroke: "#f7f8f2", fill: "#1454c4", strokeWidth: 3, shadowColor: "#f1e72b", shadowBlur: 22, shadowOpacity: .82 }
      : type === "ghost"
        ? { stroke: "#ffffff", fill: "#ffffff14", strokeWidth: 3, shadowColor: "#ffffff", shadowBlur: 14, shadowOpacity: .7 }
      : type === "spotlight"
        ? { stroke: "#fff8c7", fill: "#fff8c733", strokeWidth: 2, shadowColor: "#fff2a8", shadowBlur: 22, shadowOpacity: .6 }
        : type === "zoom"
          ? { stroke: "#ffffff", fill: "#ffffff12", strokeWidth: 4, shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .82, shadowOffsetX: 2, shadowOffsetY: 5 }
          : type === "glimpse"
            ? { stroke: "#ffffff", fill: "#ffffff38", strokeWidth: 2, shadowColor: "#ffffff", shadowBlur: 18, shadowOpacity: .6 }
          : type === "ellipse"
            ? { stroke: "#a3ff12", fill: "#a3ff126b", strokeWidth: 4, shadowColor: "#000000", shadowBlur: 11, shadowOpacity: .58, shadowOffsetX: 4, shadowOffsetY: 6 }
          : type === "line"
            ? { stroke: "#65d9ff", strokeWidth: 6, shadowColor: "#000000", shadowBlur: 9, shadowOpacity: .58, shadowOffsetX: 4, shadowOffsetY: 7 }
        : type === "arrow"
          ? { stroke: "#65d9ff", strokeWidth: 7, shadowColor: "#000000", shadowBlur: 9, shadowOpacity: .58, shadowOffsetX: 4, shadowOffsetY: 7 }
          : type === "longBallArrow"
            ? { stroke: "#65d9ff", strokeWidth: 6, shadowColor: "#000000", shadowBlur: 12, shadowOpacity: .62, shadowOffsetX: 5, shadowOffsetY: 8 }
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
    const favorite = favorites.find((item) => item.id === activeFavoriteId && item.type === type);
    const defaultActionLabel = ["line", "arrow", "longBallArrow"].includes(type)
      ? { visible: false, value: String(actionCount), position: .5, color: "#ffffff", backgroundColor: "#174ea6", fontSize: .022 }
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
      animation: favorite?.animation ? structuredClone(favorite.animation) : { fadeIn: 0, fadeOut: 0, motion: "none", pulseAmount: .05, pulseSpeed: 1.4 },
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

  const createRingForPlayer = ({ track, sample }: IdentifiedPlayer) => {
    const radiusX = clamp(sample.bbox.width * 2.2, 0.04, 0.09);
    const radiusY = clamp(radiusX * .48, .012, .038);
    makeDrawing(
      "playerRing",
      {
        kind: "playerRing",
        center: sample.foot,
        radiusX,
        radiusY,
        occlusionWidth: sample.bbox.width * 1.05,
        labelOffsetY: sample.bbox.height + .055,
        label: { visible: true, number: "", position: "", name: track.name.toUpperCase(), color: "#ffffff", fontSize: .032 },
        ringDesign: "broadcast",
        spinEnabled: true,
        spinSpeed: 1,
        showRing: true,
        splashEnabled: false,
        splashSpeed: 1,
      },
      { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot }, trackingEnabled: false },
    );
  };

  const placeRingOnPlayer = async (click: Point, mode: "ring" | "identify" | "identifyKeepTool" = "ring"): Promise<IdentifiedPlayer | null> => {
    if (detectingPlayer) return null;
    const existingTrack = [...(activeVideoContent?.playerTracks ?? [])].reverse().find((track) => track.samples.length && containsPoint(samplePlayerTrackAtTime(track, currentTime).bbox, click));
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
    const identified = await placeRingOnPlayer(click, "identify");
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
        showOrigin: true,
      }, { target: { kind: "player", trackId: track.id, anchor: "feet", referenceFoot: sample.foot } });
      setPendingGhost(null);
      return;
    }
    const identified = await placeRingOnPlayer(point, "identifyKeepTool");
    if (!identified) return;
    setPendingGhost(identified);
    setDetectionMessage("Jogador recortado · clique na nova posição");
  };

  useEffect(() => {
    if (tool === "ghost") return;
    const timer = window.setTimeout(() => setPendingGhost(null), 0);
    return () => window.clearTimeout(timer);
  }, [tool]);

  const activeTrackingDrawing = [...drawings].reverse().find((drawing) => drawing.trackingEnabled && drawing.target?.kind === "player");
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
    return {
      point: nearby.sample.foot,
      target: { kind: "player", trackId: nearby.track.id, anchor: "feet", referenceFoot: nearby.sample.foot } as DrawingTarget,
    };
  };

  const polygonPointAt = (point: Point, points: Point[]) => points.findIndex((candidate) =>
    Math.hypot((candidate.x - point.x) * width, (candidate.y - point.y) * height) <= 13,
  );

  const onPointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (event.target !== event.target.getStage()) return;
    const point = pointFromStage(event.target.getStage()!);
    if (!point) return;
    if (tool === "select") { setSelectedId(null); return; }
    if (tool === "identifyPlayer") {
      void placeRingOnPlayer(point, "identify");
      return;
    }
    if (tool === "playerRing") {
      void placeRingOnPlayer(point);
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
    if (tool === "text") {
      makeDrawing("text", { kind: "text", origin: point, text: "TEXTO", fontSize: 0.055, textDesign: "flat", groundTilt: -12, groundDepth: 7 });
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

    if (["ellipse", "rectangle", "arrow", "longBallArrow", "line", "glimpse"].includes(tool) && draft?.tool === tool) {
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
      if (tool === "arrow") makeDrawing("arrow", { kind: "arrow", points: [draft.start, point] });
      if (tool === "line") {
        const endAnchor = lineAnchorAtPoint(point);
        makeDrawing("line", {
          kind: "line",
          points: [draft.start, endAnchor?.point ?? point],
          lineDesign: "single",
          secondaryColor: "#ffffff",
          startTarget: draft.startTarget,
          endTarget: endAnchor?.target,
        });
      }
      if (tool === "longBallArrow") makeDrawing("longBallArrow", { kind: "longBallArrow", start: draft.start, end: point, curveHeight: .13, showLandingZone: true, landingZoneColor: "#65d9ff", landingZoneSize: 1 });
      if (tool === "glimpse") makeDrawing("glimpse", { kind: "glimpse", origin: draft.start, target: point, spread: 38 });
      return;
    }
    const startAnchor = tool === "line" ? lineAnchorAtPoint(point) : null;
    const start = startAnchor?.point ?? point;
    setDraft({ tool, start, points: [start], current: start, startTarget: startAnchor?.target });
  };

  const onPointerMove = (event: Konva.KonvaEventObject<PointerEvent>) => {
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
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const distance = Math.max(1, Math.hypot(deltaX, deltaY));
      let normalX = -deltaY / distance;
      let normalY = deltaX / distance;
      if (normalY > 0 || (Math.abs(normalY) < .001 && normalX > 0)) {
        normalX *= -1;
        normalY *= -1;
      }
      const arcHeight = Math.min(.13 * height * 1.6, distance * .68);
      const control = {
        x: (start.x + end.x) / 2 + normalX * arcHeight,
        y: (start.y + end.y) / 2 + normalY * arcHeight,
      };
      const points = Array.from({ length: 25 }, (_, index) => {
        const t = index / 24;
        const inverse = 1 - t;
        return { x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x, y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y };
      }).flatMap(({ x, y }) => [x, y]);
      return <Arrow listening={false} stroke="#65d9ff" strokeWidth={6} fill="#65d9ff" dash={[7, 6]} opacity={.9} shadowColor="#000000" shadowBlur={9} shadowOpacity={.58} shadowOffsetX={4} shadowOffsetY={7} points={points} pointerLength={17} pointerWidth={18} lineCap="round" lineJoin="round" />;
    }
    if (tool === "line") return <Line listening={false} stroke="#65d9ff" strokeWidth={6} dash={[7, 6]} opacity={.9} shadowColor="#000000" shadowBlur={9} shadowOpacity={.58} shadowOffsetX={4} shadowOffsetY={7} lineCap="round" lineJoin="round" points={flattenPoints([draft.start, draft.current], width, height)} />;
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
            targetOffset={targetOffsetAtTime(object, activeVideoContent?.playerTracks, currentTime)}
            playerTracks={activeVideoContent?.playerTracks}
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
    />
    <ZoomLensCanvas ref={zoomCanvasRef} drawings={drawings} currentTime={currentTime} width={width} height={height} getVideoElement={getVideoElement} />
    <PlayerLabelOverlay drawings={drawings} playerTracks={activeVideoContent?.playerTracks} currentTime={currentTime} width={width} height={height} />
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
