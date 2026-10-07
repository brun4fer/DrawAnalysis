export type Tool =
  | "select"
  | "identifyPlayer"
  | "playerRing"
  | "ghost"
  | "spotlight"
  | "zoom"
  | "ellipse"
  | "arrow"
  | "longBallArrow"
  | "line"
  | "glimpse"
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
  referenceFoot?: Point;
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
export type LineDesign = "single" | "dual" | "fadeShadow";
export type ZoneDesign = "solid" | "striped";
export type TextDesign = "flat" | "ground3d";

export interface ActionLabel {
  visible: boolean;
  value: string;
  position: number;
  color: string;
  backgroundColor: string;
  fontSize: number;
}

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
  | { kind: "identifyPlayer"; center: Point; radiusX: number; radiusY: number }
  | { kind: "playerRing"; center: Point; radiusX: number; radiusY: number; occlusionWidth?: number; labelOffsetY?: number; label?: PlayerLabel; ringDesign?: PlayerRingDesign; spinEnabled?: boolean; spinSpeed?: number; showRing?: boolean; splashEnabled?: boolean; splashSpeed?: number }
  | { kind: "ghost"; origin: Point; destination: Point; radiusX: number; radiusY: number; hideOriginal?: boolean; playerOpacity?: number; showArrow?: boolean; showOrigin?: boolean }
  | { kind: "spotlight"; target: Point; radiusX: number; radiusY: number; beamHeight: number; design?: "beam" | "isolation"; darkness?: number; feather?: number }
  | { kind: "zoom"; center: Point; radius: number; zoom: number }
  | { kind: "ellipse"; center: Point; radiusX: number; radiusY: number }
  | { kind: "rectangle"; origin: Point; width: number; height: number; fillDesign?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number; stripeOpacity?: number }
  | { kind: "longBallArrow"; start: Point; end: Point; curveHeight: number; showLandingZone?: boolean; landingZoneColor?: string; landingZoneSize?: number }
  | { kind: "line"; points: Point[]; lineDesign?: LineDesign; secondaryColor?: string; startTarget?: DrawingTarget; endTarget?: DrawingTarget }
  | { kind: "glimpse"; origin: Point; target: Point; spread: number }
  | { kind: "polygon"; points: Point[]; zoneDesign?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number; stripeOpacity?: number }
  | { kind: "triangle"; points: Point[]; fillDesign?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number; stripeOpacity?: number }
  | { kind: "arrow" | "freeDraw"; points: Point[] }
  | { kind: "text"; origin: Point; text: string; fontSize: number; textDesign?: TextDesign; groundTilt?: number; groundDepth?: number };

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
  actionLabel?: ActionLabel;
  style: DrawingStyle;
  transform: ObjectTransform;
  data: DrawingData;
}

export interface ToolFavorite {
  id: string;
  name: string;
  type: DrawingType;
  style: DrawingStyle;
  animation?: DrawingObject["animation"];
  actionLabel?: ActionLabel;
  data: DrawingData;
  createdAt: number;
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
