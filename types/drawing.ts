export type Tool =
  | "select"
  | "ellipse"
  | "arrow"
  | "line"
  | "triangle"
  | "polygon"
  | "rectangle"
  | "text"
  | "freeDraw";

export type DrawingType = Exclude<Tool, "select">;

export interface Point { x: number; y: number }

export interface DrawingStyle {
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  dash: number[];
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
  | { kind: "ellipse"; center: Point; radiusX: number; radiusY: number }
  | { kind: "rectangle"; origin: Point; width: number; height: number }
  | { kind: "arrow" | "line" | "triangle" | "polygon" | "freeDraw"; points: Point[] }
  | { kind: "text"; origin: Point; text: string; fontSize: number };

export interface DrawingObject {
  id: string;
  name: string;
  type: DrawingType;
  startTime: number;
  endTime: number;
  trackingEnabled: boolean;
  keyframes: DrawingKeyframe[];
  animation?: {
    fadeIn?: number;
    fadeOut?: number;
  };
  style: DrawingStyle;
  transform: ObjectTransform;
  data: DrawingData;
}

export const DEFAULT_STYLE: DrawingStyle = {
  stroke: "#a3ff12",
  fill: "#a3ff1233",
  strokeWidth: 4,
  opacity: 1,
  dash: [],
};

export const DEFAULT_TRANSFORM: ObjectTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};
