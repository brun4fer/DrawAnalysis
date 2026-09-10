import type { Point } from "@/types/drawing";

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function toNormalized(point: Point, width: number, height: number): Point {
  return { x: clamp01(point.x / width), y: clamp01(point.y / height) };
}

export function flattenPoints(points: Point[], width: number, height: number): number[] {
  return points.flatMap((point) => [point.x * width, point.y * height]);
}
