import { decodeMaskToRaster } from "@meta-sam/parser";
import type { NormalizedBox, PlayerTrack, Point, SamPlayerTracking, SamTrackingFrame } from "@/types/drawing";
import { resolveSamTrackingFrameAtTime } from "@/utils/samTracking";
import type { SamTrackingFrameResolution } from "@/utils/samTracking";

export interface SamTrackedPlayerFrameState {
  frame: SamTrackingFrame;
  bounds: NormalizedBox;
  mode: "exact" | "interpolated";
  resolution: SamTrackingFrameResolution;
}

export interface SamTrackedPlayerState extends SamTrackedPlayerFrameState {
  /** Unfiltered ground estimate from the selected SAM mask, for diagnostics. */
  rawFoot: Point;
  /** Bidirectionally stabilised ground trajectory used by the Ring. */
  foot: Point;
}

/** A foreground run from a SAM mask, expressed in editor-normalised space. */
export interface SamTrackedPlayerMaskRun extends NormalizedBox {}

export interface SamFootTrajectoryDiagnostics {
  sampleCount: number;
  correctedOutliers: number;
  repeatedRawPositions: number;
  repeatedStablePositions: number;
  maximumRawJump: number;
  maximumStableJump: number;
  rawJitter: number;
  stableJitter: number;
}

interface FootTrajectorySample {
  frameIndex: number;
  time: number;
  bounds: NormalizedBox;
  raw: Point;
  stable: Point;
}

interface FootTrajectory {
  samples: FootTrajectorySample[];
  byFrameIndex: Map<number, FootTrajectorySample>;
  diagnostics: SamFootTrajectoryDiagnostics;
}

const contactCache = new Map<string, Point | null>();
const rasterCache = new Map<string, Uint8Array | null>();
const localMaskRunCache = new Map<string, NormalizedBox[]>();
const trajectoryCache = new WeakMap<SamPlayerTracking, FootTrajectory>();

function maskKey(frame: SamTrackingFrame) {
  return `${frame.mask.encoding}:${frame.mask.width}x${frame.mask.height}:${frame.mask.payload}`;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Finds a stable ground contact in mask-local coordinates. A supported lower
 * edge is used instead of the single lowest pixel, so an isolated noisy pixel
 * cannot move the Ring away from the player's feet.
 */
export function robustMaskGroundContact(
  raster: ArrayLike<number>,
  width: number,
  height: number,
): Point | undefined {
  if (width < 1 || height < 1 || raster.length < width * height) return undefined;
  const rowCounts = Array.from({ length: height }, () => 0);
  let maximumRowCount = 0;
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = 0; x < width; x += 1) count += raster[y * width + x] ? 1 : 0;
    rowCounts[y] = count;
    maximumRowCount = Math.max(maximumRowCount, count);
  }
  if (!maximumRowCount) return undefined;

  const minimumRowSupport = Math.max(1, Math.ceil(width * .008), Math.ceil(maximumRowCount * .06));
  let supportedBottom = -1;
  for (let y = height - 1; y >= 0; y -= 1) {
    const first = Math.max(0, y - 2);
    let activeRows = 0;
    let support = 0;
    for (let row = first; row <= y; row += 1) {
      if (rowCounts[row]) activeRows += 1;
      support += rowCounts[row];
    }
    const requiredRows = Math.min(2, y - first + 1);
    if (rowCounts[y] > 0 && activeRows >= requiredRows && support >= Math.max(3, minimumRowSupport * 2)) {
      supportedBottom = y;
      break;
    }
  }
  if (supportedBottom < 0) {
    supportedBottom = rowCounts.findLastIndex((count) => count >= minimumRowSupport);
  }
  if (supportedBottom < 0) return undefined;

  const bandHeight = Math.max(2, Math.round(height * .055));
  const horizontalSamples: number[] = [];
  for (let y = Math.max(0, supportedBottom - bandHeight + 1); y <= supportedBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (raster[y * width + x]) horizontalSamples.push(x + .5);
    }
  }
  if (!horizontalSamples.length) return undefined;
  horizontalSamples.sort((left, right) => left - right);
  const trim = horizontalSamples.length >= 10 ? Math.floor(horizontalSamples.length * .1) : 0;
  const stableSamples = horizontalSamples.slice(trim, horizontalSamples.length - trim || undefined);
  const bottomCenter = stableSamples.reduce((sum, value) => sum + value, 0) / stableSamples.length;

  // The last few rows can alternate between the left and right foot while a
  // player runs. Row centres from the lower silhouette keep both legs in the
  // estimate, while the bottom band still anchors the result to the feet.
  const lowerStart = Math.max(0, supportedBottom - Math.max(3, Math.round(height * .42)));
  const lowerRowCenters: number[] = [];
  for (let y = lowerStart; y <= supportedBottom; y += 1) {
    if (rowCounts[y] < minimumRowSupport) continue;
    let sum = 0;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (!raster[y * width + x]) continue;
      sum += x + .5;
      count += 1;
    }
    if (count) lowerRowCenters.push(sum / count);
  }
  const lowerCenter = lowerRowCenters.length ? median(lowerRowCenters) : bottomCenter;
  const centerX = lowerCenter * .72 + bottomCenter * .28;
  return {
    x: Math.max(0, Math.min(1, centerX / width)),
    y: Math.max(0, Math.min(1, (supportedBottom + 1) / height)),
  };
}

function localGroundContact(frame: SamTrackingFrame) {
  const key = maskKey(frame);
  if (contactCache.has(key)) return contactCache.get(key) ?? undefined;
  const raster = decodedRaster(frame);
  const contact = raster
    ? robustMaskGroundContact(raster, frame.mask.width, frame.mask.height)
    : undefined;
  contactCache.set(key, contact ?? null);
  if (contactCache.size > 480) contactCache.delete(contactCache.keys().next().value as string);
  return contact;
}

function decodedRaster(frame: SamTrackingFrame) {
  const key = maskKey(frame);
  if (rasterCache.has(key)) return rasterCache.get(key) ?? undefined;
  let raster: Uint8Array | undefined;
  try {
    raster = decodeMaskToRaster(frame.mask);
  } catch {
    raster = undefined;
  }
  rasterCache.set(key, raster ?? null);
  if (rasterCache.size > 480) rasterCache.delete(rasterCache.keys().next().value as string);
  return raster;
}

function localMaskRuns(frame: SamTrackingFrame) {
  const key = maskKey(frame);
  const cached = localMaskRunCache.get(key);
  if (cached) return cached;
  const raster = decodedRaster(frame);
  if (!raster || frame.mask.width < 1 || frame.mask.height < 1) return [];
  const runs: NormalizedBox[] = [];
  for (let y = 0; y < frame.mask.height; y += 1) {
    let start = -1;
    for (let x = 0; x <= frame.mask.width; x += 1) {
      const foreground = x < frame.mask.width && Boolean(raster[y * frame.mask.width + x]);
      if (foreground && start < 0) start = x;
      if ((!foreground || x === frame.mask.width) && start >= 0) {
        runs.push({
          x: start / frame.mask.width,
          y: y / frame.mask.height,
          width: (x - start) / frame.mask.width,
          height: 1 / frame.mask.height,
        });
        start = -1;
      }
    }
  }
  localMaskRunCache.set(key, runs);
  if (localMaskRunCache.size > 480) localMaskRunCache.delete(localMaskRunCache.keys().next().value as string);
  return runs;
}

/**
 * Returns the exact binary SAM silhouette as horizontal runs in editor space.
 * These runs let the Ring be clipped behind the current player without ever
 * redrawing a second copy of the player's video pixels.
 */
export function samTrackedPlayerMaskRuns(state: SamTrackedPlayerFrameState): SamTrackedPlayerMaskRun[] {
  return localMaskRuns(state.frame).map((run) => ({
    x: state.bounds.x + run.x * state.bounds.width,
    y: state.bounds.y + run.y * state.bounds.height,
    width: run.width * state.bounds.width,
    height: run.height * state.bounds.height,
  }));
}

function groundPointForFrame(frame: SamTrackingFrame): Point | undefined {
  const local = localGroundContact(frame);
  if (!local) return undefined;
  const groundOffset = Math.min(.004, frame.bounds.height * .025);
  return {
    x: frame.bounds.x + local.x * frame.bounds.width,
    y: Math.max(0, Math.min(1, frame.bounds.y + local.y * frame.bounds.height + groundOffset)),
  };
}

function mixPoint(left: Point, right: Point, progress: number): Point {
  return {
    x: left.x + (right.x - left.x) * progress,
    y: left.y + (right.y - left.y) * progress,
  };
}

function pointDistance(left: Point, right: Point) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function framesBelongToSameTrajectory(left: FootTrajectorySample, right: FootTrajectorySample) {
  const frameGap = right.frameIndex - left.frameIndex;
  if (frameGap < 1 || frameGap > 3 || right.time <= left.time) return false;
  const leftCenter = { x: left.bounds.x + left.bounds.width / 2, y: left.bounds.y + left.bounds.height / 2 };
  const rightCenter = { x: right.bounds.x + right.bounds.width / 2, y: right.bounds.y + right.bounds.height / 2 };
  const averageHeight = (left.bounds.height + right.bounds.height) / 2;
  const leftArea = Math.max(.000001, left.bounds.width * left.bounds.height);
  const areaRatio = right.bounds.width * right.bounds.height / leftArea;
  return pointDistance(leftCenter, rightCenter) <= Math.max(.06, averageHeight * .9)
    && areaRatio >= .4
    && areaRatio <= 2.5;
}

function linearRegressionAt(samples: FootTrajectorySample[], index: number, key: "x" | "y") {
  const origin = samples[index].time;
  const from = Math.max(0, index - 2);
  const to = Math.min(samples.length - 1, index + 2);
  const neighbours: FootTrajectorySample[] = [];
  for (let candidate = from; candidate <= to; candidate += 1) {
    let connected = true;
    for (let cursor = Math.min(index, candidate); cursor < Math.max(index, candidate); cursor += 1) {
      if (!framesBelongToSameTrajectory(samples[cursor], samples[cursor + 1])) {
        connected = false;
        break;
      }
    }
    if (connected) neighbours.push(samples[candidate]);
  }
  if (neighbours.length < 3) return samples[index].stable[key];

  // A centred local linear fit preserves constant velocity exactly, including
  // with irregular timestamps. Unlike an exponential filter it introduces no
  // phase delay, because it uses the already available past and future masks.
  const averageInterval = neighbours.length > 1
    ? (neighbours[neighbours.length - 1].time - neighbours[0].time) / (neighbours.length - 1)
    : 1 / 30;
  const timeScale = Math.max(1 / 120, averageInterval * 2);
  let weightSum = 0;
  let weightedTime = 0;
  let weightedValue = 0;
  for (const sample of neighbours) {
    const relativeTime = sample.time - origin;
    const weight = 1 / (1 + (relativeTime / timeScale) ** 2);
    weightSum += weight;
    weightedTime += weight * relativeTime;
    weightedValue += weight * sample.stable[key];
  }
  const meanTime = weightedTime / weightSum;
  const meanValue = weightedValue / weightSum;
  let covariance = 0;
  let variance = 0;
  for (const sample of neighbours) {
    const relativeTime = sample.time - origin;
    const weight = 1 / (1 + (relativeTime / timeScale) ** 2);
    covariance += weight * (relativeTime - meanTime) * (sample.stable[key] - meanValue);
    variance += weight * (relativeTime - meanTime) ** 2;
  }
  const slope = variance > 1e-9 ? covariance / variance : 0;
  return meanValue - slope * meanTime;
}

function trajectoryJitter(samples: FootTrajectorySample[], key: "raw" | "stable") {
  let total = 0;
  for (let index = 1; index < samples.length - 1; index += 1) {
    if (!framesBelongToSameTrajectory(samples[index - 1], samples[index])
      || !framesBelongToSameTrajectory(samples[index], samples[index + 1])) continue;
    const beforeDuration = samples[index].time - samples[index - 1].time;
    const afterDuration = samples[index + 1].time - samples[index].time;
    if (beforeDuration <= 0 || afterDuration <= 0) continue;
    const beforeVelocity = {
      x: (samples[index][key].x - samples[index - 1][key].x) / beforeDuration,
      y: (samples[index][key].y - samples[index - 1][key].y) / beforeDuration,
    };
    const afterVelocity = {
      x: (samples[index + 1][key].x - samples[index][key].x) / afterDuration,
      y: (samples[index + 1][key].y - samples[index][key].y) / afterDuration,
    };
    total += pointDistance(beforeVelocity, afterVelocity);
  }
  return total;
}

function buildFootTrajectory(tracking: SamPlayerTracking): FootTrajectory {
  const cached = trajectoryCache.get(tracking);
  if (cached) return cached;
  const samples = [...tracking.frames]
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .map((frame): FootTrajectorySample | undefined => {
      const raw = groundPointForFrame(frame);
      const time = tracking.frameTimes?.[frame.frameIndex] ?? frame.time;
      if (!raw || !Number.isFinite(time)) return undefined;
      return { frameIndex: frame.frameIndex, time, bounds: frame.bounds, raw, stable: raw };
    })
    .filter((sample): sample is FootTrajectorySample => Boolean(sample));

  let correctedOutliers = 0;
  const corrected = samples.map((sample) => ({ ...sample, stable: { ...sample.raw } }));
  for (let index = 1; index < corrected.length - 1; index += 1) {
    const before = corrected[index - 1];
    const current = corrected[index];
    const after = corrected[index + 1];
    if (!framesBelongToSameTrajectory(before, current) || !framesBelongToSameTrajectory(current, after)) continue;
    const progress = (current.time - before.time) / (after.time - before.time);
    const expected = mixPoint(before.raw, after.raw, progress);
    const averageHeight = (before.bounds.height + current.bounds.height + after.bounds.height) / 3;
    const maximumDeviation = Math.max(.004, averageHeight * .075);
    if (pointDistance(current.raw, expected) > maximumDeviation
      && pointDistance(before.raw, after.raw) <= Math.max(.08, averageHeight * .9)) {
      current.stable = expected;
      correctedOutliers += 1;
    }
  }

  const stablePoints = corrected.map((sample, index) => {
    const estimated = {
      x: linearRegressionAt(corrected, index, "x"),
      y: linearRegressionAt(corrected, index, "y"),
    };
    const maximumAdjustment = Math.max(.003, sample.bounds.height * .06);
    const adjustment = pointDistance(sample.stable, estimated);
    const safe = adjustment > maximumAdjustment
      ? mixPoint(sample.stable, estimated, maximumAdjustment / adjustment)
      : estimated;
    return {
      x: Math.max(sample.bounds.x, Math.min(sample.bounds.x + sample.bounds.width, safe.x)),
      y: Math.max(0, Math.min(1, safe.y)),
    };
  });
  stablePoints.forEach((point, index) => { corrected[index].stable = point; });

  const jumps = (key: "raw" | "stable") => {
    const distances: number[] = [];
    for (let index = 1; index < corrected.length; index += 1) {
      if (framesBelongToSameTrajectory(corrected[index - 1], corrected[index])) {
        distances.push(pointDistance(corrected[index - 1][key], corrected[index][key]));
      }
    }
    return distances;
  };
  const repeated = (key: "raw" | "stable") => jumps(key).filter((distance) => distance < 1e-5).length;
  const rawJumps = jumps("raw");
  const stableJumps = jumps("stable");
  const trajectory: FootTrajectory = {
    samples: corrected,
    byFrameIndex: new Map(corrected.map((sample) => [sample.frameIndex, sample])),
    diagnostics: {
      sampleCount: corrected.length,
      correctedOutliers,
      repeatedRawPositions: repeated("raw"),
      repeatedStablePositions: repeated("stable"),
      maximumRawJump: Math.max(0, ...rawJumps),
      maximumStableJump: Math.max(0, ...stableJumps),
      rawJitter: trajectoryJitter(corrected, "raw"),
      stableJitter: trajectoryJitter(corrected, "stable"),
    },
  };
  trajectoryCache.set(tracking, trajectory);
  return trajectory;
}

function trajectoryPointForFrame(tracking: SamPlayerTracking, frameIndex: number) {
  return buildFootTrajectory(tracking).byFrameIndex.get(frameIndex);
}

function interpolatedTrajectoryPoint(tracking: SamPlayerTracking, beforeIndex: number, afterIndex: number, time: number) {
  const before = trajectoryPointForFrame(tracking, beforeIndex);
  const after = trajectoryPointForFrame(tracking, afterIndex);
  if (!before || !after || !framesBelongToSameTrajectory(before, after)) return undefined;
  const progress = Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time)));
  return {
    raw: mixPoint(before.raw, after.raw, progress),
    stable: mixPoint(before.stable, after.stable, progress),
  };
}

export function samTrackedPlayerTrajectoryDiagnostics(track: PlayerTrack) {
  return track.samTracking ? buildFootTrajectory(track.samTracking).diagnostics : undefined;
}

export function samTrackedPlayerFrameStateAtTime(track: PlayerTrack, currentTime: number): SamTrackedPlayerFrameState | undefined {
  const tracking = track.samTracking;
  const resolution = resolveSamTrackingFrameAtTime(tracking, currentTime);
  if (!tracking || !resolution.frame || !resolution.bounds || (resolution.mode !== "exact" && resolution.mode !== "interpolated")) return undefined;
  return {
    frame: resolution.frame,
    bounds: resolution.bounds,
    mode: resolution.mode,
    resolution,
  };
}

export function samTrackedPlayerStateAtTime(track: PlayerTrack, currentTime: number): SamTrackedPlayerState | undefined {
  const tracking = track.samTracking;
  const frameState = samTrackedPlayerFrameStateAtTime(track, currentTime);
  if (!tracking || !frameState) return undefined;
  const { resolution } = frameState;
  const trajectoryState = resolution.mode === "interpolated" && resolution.beforeFrameIndex !== undefined && resolution.afterFrameIndex !== undefined
    ? interpolatedTrajectoryPoint(tracking, resolution.beforeFrameIndex, resolution.afterFrameIndex, currentTime)
    : trajectoryPointForFrame(tracking, frameState.frame.frameIndex);
  if (!trajectoryState) return undefined;
  const { raw: rawFoot, stable: foot } = trajectoryState;
  return { ...frameState, rawFoot, foot };
}

export function pointHitsSamTrackedPlayerMask(state: SamTrackedPlayerState, point: Point) {
  const { bounds, frame } = state;
  if (bounds.width <= 0 || bounds.height <= 0
    || point.x < bounds.x || point.x > bounds.x + bounds.width
    || point.y < bounds.y || point.y > bounds.y + bounds.height) return false;
  const raster = decodedRaster(frame);
  if (!raster) return false;
  const localX = Math.max(0, Math.min(frame.mask.width - 1, Math.floor((point.x - bounds.x) / bounds.width * frame.mask.width)));
  const localY = Math.max(0, Math.min(frame.mask.height - 1, Math.floor((point.y - bounds.y) / bounds.height * frame.mask.height)));
  const radius = Math.max(1, Math.round(Math.min(frame.mask.width, frame.mask.height) * .012));
  for (let y = Math.max(0, localY - radius); y <= Math.min(frame.mask.height - 1, localY + radius); y += 1) {
    for (let x = Math.max(0, localX - radius); x <= Math.min(frame.mask.width - 1, localX + radius); x += 1) {
      if (raster[y * frame.mask.width + x]) return true;
    }
  }
  return false;
}
