import type { DrawingObject, ObjectTransform } from "@/types/drawing";

export function transformAtTime(object: DrawingObject, time: number): ObjectTransform {
  const frames = [...object.keyframes].sort((a, b) => a.time - b.time);
  if (!frames.length) return object.transform;
  const nextIndex = frames.findIndex((frame) => frame.time >= time);
  if (nextIndex === -1) return { ...object.transform, ...frames.at(-1) };
  if (nextIndex === 0) return { ...object.transform, ...frames[0] };
  const left = frames[nextIndex - 1];
  const right = frames[nextIndex];
  const progress = (time - left.time) / Math.max(0.001, right.time - left.time);
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  return {
    x: lerp(left.x ?? object.transform.x, right.x ?? object.transform.x),
    y: lerp(left.y ?? object.transform.y, right.y ?? object.transform.y),
    rotation: lerp(left.rotation ?? object.transform.rotation, right.rotation ?? object.transform.rotation),
    scaleX: lerp(left.scaleX ?? object.transform.scaleX, right.scaleX ?? object.transform.scaleX),
    scaleY: lerp(left.scaleY ?? object.transform.scaleY, right.scaleY ?? object.transform.scaleY),
  };
}
