import type { NormalizedBox, SamPlayerTracking, SamTrackingFrame } from "@/types/drawing";
import type { SamTrackResult } from "@/types/samTracking";
import { sourceTimeToTimeline } from "@/utils/videoTimeline";
import type { FreezeFrame } from "@/types/slide";

function center(box: NormalizedBox) { return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }

export interface SamTrackingFrameResolution {
  frame?: SamTrackingFrame;
  bounds?: NormalizedBox;
  expectedFrameIndex?: number;
  mode: "exact" | "interpolated" | "outside" | "missing" | "unsafe-gap";
  beforeFrameIndex?: number;
  afterFrameIndex?: number;
}

function interpolateBox(left: NormalizedBox, right: NormalizedBox, progress: number): NormalizedBox {
  const mix = (start: number, end: number) => start + (end - start) * progress;
  return {
    x: mix(left.x, right.x),
    y: mix(left.y, right.y),
    width: mix(left.width, right.width),
    height: mix(left.height, right.height),
  };
}

function canInterpolateShortGap(before: SamTrackingFrame, after: SamTrackingFrame) {
  const missingFrames = after.frameIndex - before.frameIndex - 1;
  if (missingFrames < 1 || missingFrames > 2) return false;
  const beforeCenter = center(before.bounds);
  const afterCenter = center(after.bounds);
  const centerDistance = Math.hypot(afterCenter.x - beforeCenter.x, afterCenter.y - beforeCenter.y);
  const averageHeight = (before.bounds.height + after.bounds.height) / 2;
  const beforeArea = Math.max(.000001, before.bounds.width * before.bounds.height);
  const areaRatio = after.bounds.width * after.bounds.height / beforeArea;
  return centerDistance <= Math.max(.06, averageHeight * .9) && areaRatio >= .4 && areaRatio <= 2.5;
}

/** Stops accepting output after an implausible identity jump; missing frames remain gaps. */
export function buildSamPlayerTracking(result: SamTrackResult, sourceStartTime: number, initialBounds: NormalizedBox, freezeFrames?: FreezeFrame[], sourceFrameTimes?: readonly number[]): SamPlayerTracking {
  const accepted: SamTrackingFrame[] = [];
  let previous = initialBounds;
  for (const frame of [...result.frames].sort((left, right) => left.frameIndex - right.frameIndex)) {
    const bounds: NormalizedBox = {
      x: frame.bounds.left / result.frame.width,
      y: frame.bounds.top / result.frame.height,
      width: (frame.bounds.right - frame.bounds.left) / result.frame.width,
      height: (frame.bounds.bottom - frame.bounds.top) / result.frame.height,
    };
    const priorCenter = center(previous);
    const nextCenter = center(bounds);
    const centerJump = Math.hypot(nextCenter.x - priorCenter.x, nextCenter.y - priorCenter.y);
    const priorArea = Math.max(.000001, previous.width * previous.height);
    const areaRatio = bounds.width * bounds.height / priorArea;
    if (centerJump > Math.max(.12, previous.height * 1.25) || areaRatio > 5 || areaRatio < .18) break;
    const sourceTime = sourceFrameTimes
      ? sourceFrameTimes[frame.frameIndex]
      : sourceStartTime + frame.frameIndex / result.frameRate;
    // With an explicit capture map, an unmapped provider frame must never borrow a neighbouring timestamp.
    if (sourceTime === undefined || !Number.isFinite(sourceTime)) continue;
    accepted.push({
      frameIndex: frame.frameIndex,
      time: sourceTimeToTimeline(sourceTime, freezeFrames),
      sourceTime,
      bounds,
      mask: { ...frame.mask },
      confidence: frame.confidence ?? undefined,
    });
    previous = bounds;
  }
  const startTime = sourceTimeToTimeline(sourceStartTime, freezeFrames);
  return {
    sourceStartTime,
    startTime,
    endTime: sourceTimeToTimeline(sourceStartTime + result.duration, freezeFrames),
    duration: result.duration,
    frameRate: result.frameRate,
    frameTimes: sourceFrameTimes?.map((time) => sourceTimeToTimeline(time, freezeFrames)),
    sourceWidth: result.frame.width,
    sourceHeight: result.frame.height,
    frames: accepted,
  };
}

export function resolveSamTrackingFrameAtTime(tracking: SamPlayerTracking | undefined, time: number): SamTrackingFrameResolution {
  if (!tracking || time < tracking.startTime || time > tracking.endTime || !tracking.frames.length) return { mode: "outside" };
  if (tracking.frameTimes?.length) {
    let expectedIndex = 0;
    let expectedDistance = Number.POSITIVE_INFINITY;
    tracking.frameTimes.forEach((frameTime, index) => {
      const distance = Math.abs(frameTime - time);
      if (distance < expectedDistance) { expectedIndex = index; expectedDistance = distance; }
    });
    const expectedTime = tracking.frameTimes[expectedIndex];
    const previousTime = tracking.frameTimes[expectedIndex - 1];
    const nextTime = tracking.frameTimes[expectedIndex + 1];
    // Use the interval on the side where the presented time lies. Taking the
    // smaller adjacent interval rejects valid frames in variable-frame-rate
    // video whenever the interval on the other side happens to be shorter.
    const directionalNeighbour = time < expectedTime ? previousTime : nextTime;
    const fallbackNeighbour = time < expectedTime ? nextTime : previousTime;
    const localInterval = directionalNeighbour === undefined
      ? fallbackNeighbour === undefined ? Number.POSITIVE_INFINITY : Math.abs(fallbackNeighbour - expectedTime)
      : Math.abs(directionalNeighbour - expectedTime);
    const tolerance = Number.isFinite(localInterval) ? localInterval * .55 : .75 / tracking.frameRate;
    if (expectedDistance > tolerance + .001) return { mode: "outside", expectedFrameIndex: expectedIndex };
    const exact = tracking.frames.find((frame) => frame.frameIndex === expectedIndex);
    if (exact) return { frame: exact, bounds: exact.bounds, expectedFrameIndex: expectedIndex, mode: "exact" };
    const before = [...tracking.frames].reverse().find((frame) => frame.frameIndex < expectedIndex);
    const after = tracking.frames.find((frame) => frame.frameIndex > expectedIndex);
    if (!before || !after) return { mode: "missing", expectedFrameIndex: expectedIndex, beforeFrameIndex: before?.frameIndex, afterFrameIndex: after?.frameIndex };
    if (!canInterpolateShortGap(before, after)) {
      return { mode: "unsafe-gap", expectedFrameIndex: expectedIndex, beforeFrameIndex: before.frameIndex, afterFrameIndex: after.frameIndex };
    }
    const beforeTime = tracking.frameTimes[before.frameIndex];
    const afterTime = tracking.frameTimes[after.frameIndex];
    if (![expectedTime, beforeTime, afterTime].every(Number.isFinite) || afterTime <= beforeTime) {
      return { mode: "unsafe-gap", expectedFrameIndex: expectedIndex, beforeFrameIndex: before.frameIndex, afterFrameIndex: after.frameIndex };
    }
    const progress = Math.max(0, Math.min(1, (expectedTime - beforeTime) / (afterTime - beforeTime)));
    // Reuse the nearest real SAM contour, but move/scale it along the trajectory defined by
    // the valid masks on both sides. This avoids both a frozen mask and an invented contour.
    const nearest = progress <= .5 ? before : after;
    return {
      frame: nearest,
      bounds: interpolateBox(before.bounds, after.bounds, progress),
      expectedFrameIndex: expectedIndex,
      mode: "interpolated",
      beforeFrameIndex: before.frameIndex,
      afterFrameIndex: after.frameIndex,
    };
  }
  let closest: SamTrackingFrame | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const frame of tracking.frames) {
    const candidate = Math.abs(frame.time - time);
    if (candidate < distance) { closest = frame; distance = candidate; }
  }
  if (distance <= .75 / tracking.frameRate && closest) return { frame: closest, bounds: closest.bounds, expectedFrameIndex: closest.frameIndex, mode: "exact" };
  return { mode: "missing" };
}

export function samTrackingFrameAtTime(tracking: SamPlayerTracking | undefined, time: number) {
  return resolveSamTrackingFrameAtTime(tracking, time).frame;
}

/** Reuses the leading part of a longer result without changing masks or frame correspondence. */
export function trimSamPlayerTracking(tracking: SamPlayerTracking, duration: 2 | 3, endTime: number): SamPlayerTracking {
  if (duration >= tracking.duration) return tracking;
  const frameTimes = tracking.frameTimes?.filter((time) => time <= endTime + .0005);
  const allowedIndexes = new Set(frameTimes?.map((_time, index) => index));
  return {
    ...tracking,
    duration,
    endTime,
    frameTimes,
    frames: tracking.frames.filter((frame) => allowedIndexes.size ? allowedIndexes.has(frame.frameIndex) : frame.time <= endTime + .0005),
  };
}
