import type { DrawingObject, PlayerTrack, PlayerTrackSample, Point } from "@/types/drawing";

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

export function targetOffsetAtTime(object: DrawingObject, tracks: PlayerTrack[] | undefined, currentTime: number): Point {
  if (object.target?.kind !== "player" || !object.target.referenceFoot) return { x: 0, y: 0 };
  const track = tracks?.find((item) => item.id === object.target?.trackId);
  if (!track?.samples.length) return { x: 0, y: 0 };
  const sample = samplePlayerTrackAtTime(track, currentTime);
  return {
    x: sample.foot.x - object.target.referenceFoot.x,
    y: sample.foot.y - object.target.referenceFoot.y,
  };
}
