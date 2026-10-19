import type { AnalysisSlide, FreezeFrame, VideoSlideContent } from "@/types/slide";

export interface VideoTimelinePoint {
  sourceTime: number;
  timelineTime: number;
  freeze?: FreezeFrame;
  freezeStart?: number;
  freezeEnd?: number;
}

export function orderedFreezeFrames(freezeFrames?: FreezeFrame[]) {
  return [...(freezeFrames ?? [])].sort((left, right) => left.sourceTime - right.sourceTime);
}

export function getTimelineDuration(sourceDuration: number, freezeFrames?: FreezeFrame[]) {
  return Math.max(0, sourceDuration) + orderedFreezeFrames(freezeFrames).reduce((total, freeze) => total + Math.max(0, freeze.duration), 0);
}

export function getSourceDuration(timelineDuration: number, freezeFrames?: FreezeFrame[]) {
  return Math.max(0, timelineDuration - orderedFreezeFrames(freezeFrames).reduce((total, freeze) => total + Math.max(0, freeze.duration), 0));
}

export function sourceTimeToTimeline(sourceTime: number, freezeFrames?: FreezeFrame[]) {
  const offset = orderedFreezeFrames(freezeFrames)
    .filter((freeze) => freeze.sourceTime < sourceTime)
    .reduce((total, freeze) => total + Math.max(0, freeze.duration), 0);
  return Math.max(0, sourceTime) + offset;
}

export function timelineTimeToSource(timelineTime: number, freezeFrames?: FreezeFrame[]): VideoTimelinePoint {
  const target = Math.max(0, timelineTime);
  let offset = 0;
  let lastCompletedFreezeSource: number | undefined;
  for (const freeze of orderedFreezeFrames(freezeFrames)) {
    const freezeStart = freeze.sourceTime + offset;
    const freezeEnd = freezeStart + Math.max(0, freeze.duration);
    if (target >= freezeStart && target < freezeEnd) {
      return { sourceTime: freeze.sourceTime, timelineTime: target, freeze, freezeStart, freezeEnd };
    }
    if (target < freezeStart) {
      let sourceTime = Math.max(0, target - offset);
      if (lastCompletedFreezeSource !== undefined && Math.abs(sourceTime - lastCompletedFreezeSource) < .0001) sourceTime += .001;
      return { sourceTime, timelineTime: target };
    }
    offset += Math.max(0, freeze.duration);
    lastCompletedFreezeSource = freeze.sourceTime;
  }
  let sourceTime = Math.max(0, target - offset);
  if (lastCompletedFreezeSource !== undefined && Math.abs(sourceTime - lastCompletedFreezeSource) < .0001) sourceTime += .001;
  return { sourceTime, timelineTime: target };
}

export function freezeRange(freeze: FreezeFrame, freezeFrames?: FreezeFrame[]) {
  const start = sourceTimeToTimeline(freeze.sourceTime, orderedFreezeFrames(freezeFrames).filter((item) => item.id !== freeze.id));
  return { start, end: start + Math.max(0, freeze.duration) };
}

export function freezeFramesInsideClip(content: VideoSlideContent, sourceEnd: number) {
  return orderedFreezeFrames(content.freezeFrames).filter((freeze) =>
    freeze.sourceTime >= content.startTime && freeze.sourceTime < sourceEnd,
  );
}

export function getVideoClipPresentationDuration(content: VideoSlideContent, fallbackSourceDuration: number) {
  const sourceEnd = Math.max(
    content.startTime,
    content.endTime ?? content.startTime + Math.max(0, fallbackSourceDuration),
  );
  const freezes = freezeFramesInsideClip(content, sourceEnd);
  return Math.max(0, sourceEnd - content.startTime)
    + freezes.reduce((total, freeze) => total + Math.max(0, freeze.duration), 0);
}

export function getSlidePresentationDuration(slide: AnalysisSlide) {
  if (slide.content.kind === "tactical-board") {
    const baseDuration = Math.max(.25, Number.isFinite(slide.duration) ? slide.duration : 4);
    const movementCount = slide.content.movements?.length ?? 0;
    if (!movementCount) return baseDuration;
    const travel = Math.max(.15, slide.content.movementDuration ?? 1.2);
    const hold = Math.max(0, slide.content.movementHoldDuration ?? .65);
    return Math.max(baseDuration, hold + movementCount * (travel + hold));
  }
  if (slide.content.kind !== "video") return Math.max(.25, Number.isFinite(slide.duration) ? slide.duration : 4);
  return Math.max(.25, getVideoClipPresentationDuration(slide.content, slide.duration));
}
