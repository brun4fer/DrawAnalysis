import type { DrawingObject, PlayerTrack, PlayerTrackSample, Point } from "@/types/drawing";
import { samTrackedPlayerStateAtTime } from "@/utils/samTrackedPlayer";

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function playerGroundPoint(sample: PlayerTrackSample): Point {
  const detectedFootY = sample.bbox.y + sample.bbox.height;
  const groundOffset = Math.min(.005, sample.bbox.height * .04);
  return {
    x: clamp(sample.foot.x, sample.bbox.x, sample.bbox.x + sample.bbox.width),
    y: clamp(Math.max(sample.foot.y, detectedFootY) + groundOffset, 0, 1),
  };
}

export function samplePlayerTrackAtTime(track: PlayerTrack, currentTime: number): PlayerTrackSample {
  const samples = [...track.samples].sort((left, right) => left.time - right.time);
  const rightIndex = samples.findIndex((sample) => sample.time >= currentTime);
  if (rightIndex < 0) return samples[samples.length - 1];
  if (rightIndex === 0) return samples[0];
  const left = samples[rightIndex - 1];
  const right = samples[rightIndex];
  if (right.time - left.time > .45) return left;
  const progress = Math.max(0, Math.min(1, (currentTime - left.time) / Math.max(.001, right.time - left.time)));
  const mix = (from: number, to: number) => from + (to - from) * progress;
  return {
    time: currentTime,
    confidence: mix(left.confidence, right.confidence),
    foot: { x: mix(left.foot.x, right.foot.x), y: mix(left.foot.y, right.foot.y) },
    bbox: {
      x: mix(left.bbox.x, right.bbox.x),
      y: mix(left.bbox.y, right.bbox.y),
      width: mix(left.bbox.width, right.bbox.width),
      height: mix(left.bbox.height, right.bbox.height),
    },
  };
}

/**
 * A Ring added with Q after a SAM tracking run predates the explicit
 * `followSamTracking` flag in a few saved projects.  Those Rings still belong
 * to the SAM run when their own lifetime intersects it.  Treating that narrow
 * legacy case as SAM-following keeps the Ring on the frozen source frame
 * instead of advancing along the presentation clock.
 */
export function followsSamTracking(object: DrawingObject, tracks: PlayerTrack[] | undefined) {
  if (object.target?.kind !== "player") return false;
  const track = tracks?.find((item) => item.id === object.target?.trackId);
  const tracking = track?.samTracking;
  if (!tracking) return false;
  if (object.target.followSamTracking) return true;
  if (object.data.kind !== "playerRing") return false;
  const tolerance = .05;
  return object.startTime <= tracking.endTime + tolerance
    && object.endTime >= tracking.startTime - tolerance;
}

export function targetOffsetAtTime(object: DrawingObject, tracks: PlayerTrack[] | undefined, currentTime: number, sourceTime?: number): Point {
  if (object.target?.kind !== "player" || !object.target.referenceFoot) return { x: 0, y: 0 };
  const track = tracks?.find((item) => item.id === object.target?.trackId);
  if (!track?.samples.length) return { x: 0, y: 0 };
  if (followsSamTracking(object, tracks)) {
    const state = samTrackedPlayerStateAtTime(track, currentTime, sourceTime);
    if (!state) return { x: 0, y: 0 };
    return {
      x: state.foot.x - object.target.referenceFoot.x,
      y: state.foot.y - object.target.referenceFoot.y,
    };
  }
  const sample = samplePlayerTrackAtTime(track, currentTime);
  return {
    x: sample.foot.x - object.target.referenceFoot.x,
    y: sample.foot.y - object.target.referenceFoot.y,
  };
}

/** Old/manual targets are always available; SAM-following targets require a safe mask for this frame. */
export function targetAvailableAtTime(object: DrawingObject, tracks: PlayerTrack[] | undefined, currentTime: number, sourceTime?: number) {
  if (!followsSamTracking(object, tracks)) return true;
  const track = tracks?.find((item) => item.id === object.target?.trackId);
  return Boolean(track && samTrackedPlayerStateAtTime(track, currentTime, sourceTime));
}
