import type { DrawingObject, ObjectTransform } from "@/types/drawing";

export interface TemporalObjectState {
  visible: boolean;
  transform: ObjectTransform;
  opacity: number;
  entryProgress: number;
  exitProgress: number;
  points?: number[];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

export function defaultDrawingAnimationFor(type: DrawingObject["type"]): NonNullable<DrawingObject["animation"]> {
  if (["arrow", "longBallArrow", "line", "freeDraw"].includes(type)) {
    return { configured: true, fadeIn: .55, fadeOut: .35, motion: "draw", pulseAmount: .05, pulseSpeed: 1.4 };
  }
  if (type === "text") return { configured: true, fadeIn: .65, fadeOut: .35, motion: "reveal", pulseAmount: .05, pulseSpeed: 1.4 };
  if (type === "playerRing") return { configured: true, fadeIn: .34, fadeOut: .42, motion: "ringLock", pulseAmount: .05, pulseSpeed: 1.4 };
  if (["spotlight", "zoom", "ellipse", "triangle", "polygon", "rectangle", "glimpse"].includes(type)) {
    return { configured: true, fadeIn: .42, fadeOut: .45, motion: "scaleIn", pulseAmount: .05, pulseSpeed: 1.4 };
  }
  if (type === "ghost") return { configured: true, fadeIn: .24, fadeOut: .35, motion: "none", pulseAmount: .05, pulseSpeed: 1.4 };
  return { configured: true, fadeIn: 0, fadeOut: 0, motion: "none", pulseAmount: .05, pulseSpeed: 1.4 };
}

export function resolvedDrawingAnimation(object: DrawingObject): NonNullable<DrawingObject["animation"]> {
  const animation = object.animation;
  const alreadyCustomized = animation?.configured === true
    || (animation?.motion !== undefined && animation.motion !== "none")
    || (animation?.fadeIn ?? 0) > 0
    || (animation?.fadeOut ?? 0) > 0;
  return alreadyCustomized ? { ...defaultDrawingAnimationFor(object.type), ...animation } : defaultDrawingAnimationFor(object.type);
}

export function getObjectStateAtTime(object: DrawingObject, currentTime: number): TemporalObjectState {
  const animation = resolvedDrawingAnimation(object);
  const visible = currentTime >= object.startTime && currentTime <= object.endTime;
  const frames = [...object.keyframes].sort((a, b) => a.time - b.time);
  const bounds = surroundingFrames(frames, currentTime);
  const frameGap = bounds.left && bounds.right ? bounds.right.time - bounds.left.time : 0;
  const progress = bounds.left && bounds.right && bounds.left !== bounds.right
    ? frameGap > .45 ? 0 : (currentTime - bounds.left.time) / Math.max(.001, frameGap)
    : 0;
  const value = (key: keyof ObjectTransform) => {
    const base = object.transform[key];
    const last = frames.at(-1);
    const previous = frames.at(-2);
    if (object.trackingEnabled && last && previous && currentTime > last.time && key !== "rotation") {
      const lastValue = last[key] ?? base;
      const previousValue = previous[key] ?? base;
      const frameDuration = Math.max(.04, last.time - previous.time);
      const predictionDuration = Math.min(.32, currentTime - last.time);
      return lastValue + (lastValue - previousValue) / frameDuration * predictionDuration;
    }
    const left = bounds.left?.[key] ?? base;
    const right = bounds.right?.[key] ?? left;
    return left + (right - left) * progress;
  };
  const points = interpolatePoints(bounds.left?.points, bounds.right?.points, progress);
  const objectDuration = Math.max(0, object.endTime - object.startTime);
  const fadeIn = Math.min(objectDuration / 2, Math.max(0, animation.fadeIn ?? 0));
  const fadeOut = Math.min(objectDuration / 2, Math.max(0, animation.fadeOut ?? 0));
  const rawEntryProgress = fadeIn ? clamp01((currentTime - object.startTime) / fadeIn) : 1;
  const rawExitProgress = fadeOut ? clamp01((object.endTime - currentTime) / fadeOut) : 1;
  const entryProgress = easeOutCubic(rawEntryProgress);
  const exitProgress = rawExitProgress * rawExitProgress * (3 - 2 * rawExitProgress);
  const motion = animation.motion === "pulse" ? "pulse" : "none";
  const pulseAmount = Math.max(0, Math.min(.25, animation.pulseAmount ?? .05));
  const pulseSpeed = Math.max(.1, animation.pulseSpeed ?? 1.4);
  const pulseFactor = motion === "pulse"
    ? 1 + Math.sin(Math.max(0, currentTime - object.startTime) * Math.PI * 2 * pulseSpeed) * pulseAmount
    : 1;
  const animatedScale = pulseFactor;
  return {
    visible,
    transform: { x: value("x"), y: value("y"), rotation: value("rotation"), scaleX: value("scaleX") * animatedScale, scaleY: value("scaleY") * animatedScale },
    opacity: object.style.opacity * Math.min(rawEntryProgress, exitProgress),
    entryProgress,
    exitProgress,
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
