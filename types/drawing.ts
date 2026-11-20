export type Tool =
  | "select"
  | "identifyPlayer"
  | "sam31"
  | "playerLabel"
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

/** Workflow tools do not become persisted drawing object types. */
export type DrawingType = Exclude<Tool, "select" | "sam31">;

export interface Point { x: number; y: number }

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerSegmentationMask {
  /** Tight mask bounds in coordinates of the original video frame. */
  bounds: NormalizedBox;
  /** Feathered alpha mask, stored independently from its visual effects. */
  maskDataUrl: string;
  /** Original frame pixels clipped by maskDataUrl. */
  cutoutDataUrl: string;
  width: number;
  height: number;
  frameTime: number;
  quality: number;
  /** Local segmentation time, including first-use model initialization. */
  analysisMs?: number;
  method: "bodypix-instance" | "bodypix-semantic" | "manual" | "sam-3.1";
}

export interface PlayerTrackSample {
  time: number;
  bbox: NormalizedBox;
  foot: Point;
  confidence: number;
  mask?: PlayerSegmentationMask;
}

export interface SamTrackingFrame {
  frameIndex: number;
  /** Editor timeline time represented by this returned source frame. */
  time: number;
  /** Exact mediaTime reported for the original video frame copied into the SAM clip. */
  sourceTime?: number;
  bounds: NormalizedBox;
  mask: {
    encoding: "lossless" | "one_bit";
    payload: string;
    width: number;
    height: number;
  };
  confidence?: number;
}

export interface SamPlayerTracking {
  sourceStartTime: number;
  startTime: number;
  endTime: number;
  /** Requested interval, currently between 1 and 8 seconds. */
  duration: number;
  frameRate: number;
  /** Exact timeline times of every encoded frame, including frames for which SAM returned no mask. */
  frameTimes?: number[];
  sourceWidth: number;
  sourceHeight: number;
  frames: SamTrackingFrame[];
}

export interface PlayerTrack {
  id: string;
  name: string;
  source: "automatic" | "manual";
  status: "seeded" | "processing" | "ready" | "needs-review";
  appearanceColor?: [number, number, number];
  samples: PlayerTrackSample[];
  /** Optional compact SAM video masks. Older projects simply omit this field. */
  samTracking?: SamPlayerTracking;
}

export interface DrawingTarget {
  kind: "player";
  trackId: string;
  anchor: "feet";
  referenceFoot?: Point;
  /** Opt-in for effects created from an already confirmed SAM video track. */
  followSamTracking?: boolean;
}

export interface PlayerLabel {
  visible: boolean;
  number: string;
  position: string;
  name: string;
  color: string;
  fontSize: number;
}

export type PlayerRingDesign = "segmented" | "doubleLine" | "broadcast" | "broadcastGlow" | "pitchSegmented";
export type ArrowDesign = "broadcast" | "tacticalFlat";
export type LongBallArrowDesign = "broadcast" | "tacticalDashed";
export type LineDesign = "single" | "dual" | "fadeShadow";
export type ZoneDesign = "solid" | "striped";
export type TextDesign = "flat" | "ground3d" | "analysisWhite" | "pitchTactical" | "pitchTitle";
export type TextFont = "inter" | "condensed" | "heavy";

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
  groundHeight?: number;
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
  | { kind: "playerLabel"; anchor: Point; labelOffsetY?: number; label: PlayerLabel }
  | { kind: "playerRing"; center: Point; radiusX: number; radiusY: number; occlusionWidth?: number; labelOffsetY?: number; label?: PlayerLabel; ringDesign?: PlayerRingDesign; spinEnabled?: boolean; spinSpeed?: number; showRing?: boolean; splashEnabled?: boolean; splashSpeed?: number; showMovementArrow?: boolean }
  | { kind: "ghost"; origin: Point; destination: Point; radiusX: number; radiusY: number; hideOriginal?: boolean; playerOpacity?: number; showArrow?: boolean; showOrigin?: boolean; animateMovement?: boolean; returnToOrigin?: boolean; travelDuration?: number }
  | { kind: "spotlight"; target: Point; radiusX: number; radiusY: number; beamHeight: number; design?: "beam" | "isolation"; darkness?: number; feather?: number }
  | { kind: "zoom"; center: Point; radius: number; zoom: number }
  | { kind: "ellipse"; center: Point; radiusX: number; radiusY: number }
  | { kind: "rectangle"; origin: Point; width: number; height: number; fillDesign?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number; stripeOpacity?: number }
  | { kind: "longBallArrow"; start: Point; end: Point; control?: Point; curveHeight: number; longBallDesign?: LongBallArrowDesign; showLandingZone?: boolean; landingZoneColor?: string; landingZoneSize?: number }
  | { kind: "line"; points: Point[]; lineDesign?: LineDesign; secondaryColor?: string; startTarget?: DrawingTarget; endTarget?: DrawingTarget; pointTargets?: Array<DrawingTarget | null> }
  | { kind: "glimpse"; origin: Point; target: Point; spread: number }
  | { kind: "polygon"; points: Point[]; zoneDesign?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number; stripeOpacity?: number }
  | { kind: "triangle"; points: Point[]; fillDesign?: ZoneDesign; stripeColor?: string; stripeSpacing?: number; stripeAngle?: number; stripeOpacity?: number }
  | { kind: "arrow"; points: Point[]; arrowDesign?: ArrowDesign }
  | { kind: "freeDraw"; points: Point[] }
  | {
    kind: "text";
    origin: Point;
    text: string;
    fontSize: number;
    textDesign?: TextDesign;
    /** Font family selection for the text presets. Existing projects use Inter. */
    fontFamily?: TextFont;
    /** Letter spacing as a fraction of the font size, kept independent of canvas resolution. */
    letterSpacing?: number;
    /** Vertical compression used by the two pitch-aligned text presets. */
    pitchScaleY?: number;
    groundTilt?: number;
    groundDepth?: number;
  };

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
    configured?: boolean;
    fadeIn?: number;
    fadeOut?: number;
    motion?: "none" | "scaleIn" | "ringLock" | "pulse" | "draw" | "reveal";
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
  groundHeight: .08,
};

export const DEFAULT_TRANSFORM: ObjectTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};
