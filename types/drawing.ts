export type Tool =
  | "select"
  | "playerRing"
  | "spotlight"
  | "ellipse"
  | "arrow"
  | "longBallArrow"
  | "line"
  | "triangle"
  | "polygon"
  | "rectangle"
  | "text"
  | "freeDraw";

export type DrawingType = Exclude<Tool, "select">;

export interface Point { x: number; y: number }

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerTrackSample {
  time: number;
  bbox: NormalizedBox;
  foot: Point;
  confidence: number;
}

export interface PlayerTrack {
  id: string;
  name: string;
  source: "automatic" | "manual";
  status: "seeded" | "processing" | "ready" | "needs-review";
  appearanceColor?: [number, number, number];
  samples: PlayerTrackSample[];
}

export interface DrawingTarget {
  kind: "player";
  trackId: string;
  anchor: "feet";
}

export interface PlayerLabel {
  visible: boolean;
  number: string;
  position: string;
  name: string;
  color: string;
  fontSize: number;
}

export type PlayerRingDesign = "segmented" | "doubleLine" | "broadcast" | "broadcastGlow";

export interface DrawingStyle {
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  dash: number[];
  shadowColor: string;
  shadowBlur: number;
  shadowOpacity: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface ObjectTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface DrawingKeyframe {
  time: number;
  x?: number;
  y?: number;
  points?: number[];
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

export type DrawingData =
  | { kind: "playerRing"; center: Point; radiusX: number; radiusY: number; occlusionWidth?: number; labelOffsetY?: number; label?: PlayerLabel; ringDesign?: PlayerRingDesign; spinEnabled?: boolean; spinSpeed?: number }
  | { kind: "spotlight"; target: Point; radiusX: number; radiusY: number; beamHeight: number }
  | { kind: "ellipse"; center: Point; radiusX: number; radiusY: number }
  | { kind: "rectangle"; origin: Point; width: number; height: number }
  | { kind: "longBallArrow"; start: Point; end: Point; curveHeight: number }
  | { kind: "arrow" | "line" | "triangle" | "polygon" | "freeDraw"; points: Point[] }
  | { kind: "text"; origin: Point; text: string; fontSize: number };

export interface DrawingObject {
  id: string;
  name: string;
  type: DrawingType;
  startTime: number;
  endTime: number;
  trackingEnabled: boolean;
  target?: DrawingTarget;
  keyframes: DrawingKeyframe[];
  animation?: {
    fadeIn?: number;
    fadeOut?: number;
    motion?: "none" | "scaleIn" | "ringLock" | "pulse";
    pulseAmount?: number;
    pulseSpeed?: number;
  };
  style: DrawingStyle;
  transform: ObjectTransform;
  data: DrawingData;
}

export const DEFAULT_STYLE: DrawingStyle = {
  stroke: "#a3ff12",
  fill: "#a3ff1280",
  strokeWidth: 4,
  opacity: 1,
  dash: [],
  shadowColor: "#000000",
  shadowBlur: 0,
  shadowOpacity: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

export const DEFAULT_TRANSFORM: ObjectTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};
