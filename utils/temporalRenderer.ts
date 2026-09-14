import type { DrawingObject, ObjectTransform } from "@/types/drawing";

export interface TemporalObjectState {
  visible: boolean;
  transform: ObjectTransform;
  opacity: number;
  points?: number[];
}

export function getObjectStateAtTime(object: DrawingObject, currentTime: number): TemporalObjectState {
  const visible = currentTime >= object.startTime && currentTime <= object.endTime;
  const frames = [...object.keyframes].sort((a, b) => a.time - b.time);
  const bounds = surroundingFrames(frames, currentTime);
  const progress = bounds.left && bounds.right && bounds.left !== bounds.right
    ? (currentTime - bounds.left.time) / Math.max(.001, bounds.right.time - bounds.left.time)
    : 0;
  const value = (key: keyof ObjectTransform) => {
    const base = object.transform[key];
    const left = bounds.left?.[key] ?? base;
    const right = bounds.right?.[key] ?? left;
    return left + (right - left) * progress;
  };
  const points = interpolatePoints(bounds.left?.points, bounds.right?.points, progress);
  const fadeIn = Math.max(0, object.animation?.fadeIn ?? 0);
  const fadeOut = Math.max(0, object.animation?.fadeOut ?? 0);
  const inFactor = fadeIn ? Math.min(1, Math.max(0, (currentTime - object.startTime) / fadeIn)) : 1;
  const outFactor = fadeOut ? Math.min(1, Math.max(0, (object.endTime - currentTime) / fadeOut)) : 1;
  return {
    visible,
    transform: { x: value("x"), y: value("y"), rotation: value("rotation"), scaleX: value("scaleX"), scaleY: value("scaleY") },
    opacity: object.style.opacity * Math.min(inFactor, outFactor),
    points,
  };
}

function surroundingFrames(frames: DrawingObject["keyframes"], time: number) {
  if (!frames.length) return { left: undefined, right: undefined };
  const rightIndex = frames.findIndex((frame) => frame.time >= time);
  if (rightIndex < 0) return { left: frames.at(-1), right: frames.at(-1) };
  if (rightIndex === 0) return { left: frames[0], right: frames[0] };
  return { left: frames[rightIndex - 1], right: frames[rightIndex] };
}

function interpolatePoints(left: number[] | undefined, right: number[] | undefined, progress: number) {
  if (!left) return right;
  if (!right || left.length !== right.length) return left;
  return left.map((value, index) => value + (right[index] - value) * progress);
}
