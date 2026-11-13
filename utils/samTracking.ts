import type { NormalizedBox, SamPlayerTracking, SamTrackingFrame } from "@/types/drawing";
import type { SamTrackResult } from "@/types/samTracking";
import { sourceTimeToTimeline } from "@/utils/videoTimeline";
import type { FreezeFrame } from "@/types/slide";

function center(box: NormalizedBox) { return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; }

/** Stops accepting output after an implausible identity jump; missing frames remain gaps. */
export function buildSamPlayerTracking(result: SamTrackResult, sourceStartTime: number, initialBounds: NormalizedBox, freezeFrames?: FreezeFrame[]): SamPlayerTracking {
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
    const sourceTime = sourceStartTime + frame.frameIndex / result.frameRate;
    accepted.push({
      frameIndex: frame.frameIndex,
      time: sourceTimeToTimeline(sourceTime, freezeFrames),
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
    sourceWidth: result.frame.width,
    sourceHeight: result.frame.height,
    frames: accepted,
  };
}

export function samTrackingFrameAtTime(tracking: SamPlayerTracking | undefined, time: number) {
  if (!tracking || time < tracking.startTime || time > tracking.endTime || !tracking.frames.length) return undefined;
  let closest: SamTrackingFrame | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const frame of tracking.frames) {
    const candidate = Math.abs(frame.time - time);
    if (candidate < distance) { closest = frame; distance = candidate; }
  }
  return distance <= .75 / tracking.frameRate ? closest : undefined;
}
