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

/**
 * A direction vector based on the already-stabilised SAM ground path. It is a
 * visual summary of the observed tracking interval, never a prediction and
 * never a new SAM request.
 */
export interface SamTrackedPlayerMovement {
  start: Point;
  end: Point;
  distance: number;
}

export interface SamTrackedPlayerPathPoint {
  time: number;
  foot: Point;
}

interface FootTrajectorySample {
  frameIndex: number;
  time: number;
  bounds: NormalizedBox;
  baseline: Point;
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

function quantile(sorted: number[], amount: number) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * amount)));
  return sorted[index];
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
  const lowerHorizontalSamples: number[] = [];
  for (let y = lowerStart; y <= supportedBottom; y += 1) {
    if (rowCounts[y] < minimumRowSupport) continue;
    let sum = 0;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (!raster[y * width + x]) continue;
      sum += x + .5;
      lowerHorizontalSamples.push(x + .5);
      count += 1;
    }
    if (count) lowerRowCenters.push(sum / count);
  }
  lowerHorizontalSamples.sort((left, right) => left - right);
  const rowCenter = lowerRowCenters.length ? median(lowerRowCenters) : bottomCenter;
  const lowerEnvelopeCenter = lowerHorizontalSamples.length
    ? (quantile(lowerHorizontalSamples, .08) + quantile(lowerHorizontalSamples, .92)) / 2
    : rowCenter;
  const lowerTrim = lowerHorizontalSamples.length >= 12 ? Math.floor(lowerHorizontalSamples.length * .08) : 0;
  const lowerStableSamples = lowerHorizontalSamples.slice(lowerTrim, lowerHorizontalSamples.length - lowerTrim || undefined);
  const lowerMassCenter = lowerStableSamples.length
    ? lowerStableSamples.reduce((sum, value) => sum + value, 0) / lowerStableSamples.length
    : rowCenter;

  // The horizontal ground reference must remain between the legs instead of
  // following whichever boot happens to touch the last mask rows. A robust
  // lower-silhouette envelope carries most of the weight; the bottom band is
  // retained only as a small contact cue. This removes stride alternation
  // without predicting the player's motion or adding a fixed lead offset.
  const lowerCenter = lowerEnvelopeCenter * .58 + lowerMassCenter * .27 + rowCenter * .15;
  const centerX = lowerCenter * .9 + bottomCenter * .1;
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

function centredTrajectoryEstimateAt(
  samples: FootTrajectorySample[],
  index: number,
  valueAt: (sample: FootTrajectorySample) => number,
) {
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
  if (neighbours.length < 3) return valueAt(samples[index]);

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
    weightedValue += weight * valueAt(sample);
  }
  const meanTime = weightedTime / weightSum;
  const meanValue = weightedValue / weightSum;
  let covariance = 0;
  let variance = 0;
  for (const sample of neighbours) {
    const relativeTime = sample.time - origin;
    const weight = 1 / (1 + (relativeTime / timeScale) ** 2);
    covariance += weight * (relativeTime - meanTime) * (valueAt(sample) - meanValue);
    variance += weight * (relativeTime - meanTime) ** 2;
  }
  const slope = variance > 1e-9 ? covariance / variance : 0;
  const linearEstimate = meanValue - slope * meanTime;
  if (neighbours.length < 5) return linearEstimate;

  // With the complete five-frame window, a centred quadratic fit preserves
  // genuine acceleration and smooth changes of direction. A linear fit can
  // mistake those movements for noise and visibly leave the Ring behind.
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (const sample of neighbours) {
    const normalisedTime = (sample.time - origin) / timeScale;
    const weight = 1 / (1 + normalisedTime ** 2);
    const powers = [1, normalisedTime, normalisedTime ** 2];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        matrix[row][column] += weight * powers[row] * powers[column];
      }
      matrix[row][3] += weight * powers[row] * valueAt(sample);
    }
  }
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    }
    if (Math.abs(matrix[best][pivot]) < 1e-9) return linearEstimate;
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    const divisor = matrix[pivot][pivot];
    for (let column = pivot; column < 4; column += 1) matrix[pivot][column] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let column = pivot; column < 4; column += 1) matrix[row][column] -= factor * matrix[pivot][column];
    }
  }
  return matrix[0][3];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pixelDistance(left: Point, right: Point, tracking: SamPlayerTracking) {
  return Math.hypot(
    (right.x - left.x) * tracking.sourceWidth,
    (right.y - left.y) * tracking.sourceHeight,
  );
}

function axisPixelScale(tracking: SamPlayerTracking, key: "x" | "y") {
  return key === "x" ? tracking.sourceWidth : tracking.sourceHeight;
}

function relativeGroundCoordinate(sample: FootTrajectorySample, key: "x" | "y") {
  return sample.stable[key] - sample.baseline[key];
}

/**
 * Smooths only mask-shape noise relative to the current player bounds. The
 * player's actual translation and camera movement remain at the current
 * timestamp, which prevents the phase lag caused by filtering absolute x/y.
 */
function adaptiveRelativeCoordinate(
  samples: FootTrajectorySample[],
  index: number,
  key: "x" | "y",
  tracking: SamPlayerTracking,
) {
  const sample = samples[index];
  const scale = axisPixelScale(tracking, key);
  const playerHeightPx = sample.bounds.height * tracking.sourceHeight;
  const currentRelative = relativeGroundCoordinate(sample, key);
  const estimatedRelative = centredTrajectoryEstimateAt(samples, index, (candidate) => relativeGroundCoordinate(candidate, key));
  const deviationPx = Math.abs(estimatedRelative - currentRelative) * scale;

  // One mask pixel is already meaningful on a distant player. Corrections are
  // therefore proportional to the tracked player's height, not to the canvas.
  const quietPx = key === "x"
    ? clamp(playerHeightPx * .02, .65, 1.75)
    : clamp(playerHeightPx * .025, 1, 2.25);
  if (deviationPx <= quietPx) return sample.stable[key];
  const fullCorrectionPx = key === "x"
    ? Math.max(quietPx + .75, playerHeightPx * .065)
    : Math.max(quietPx + 1, playerHeightPx * .08);
  const strength = clamp((deviationPx - quietPx) / Math.max(.001, fullCorrectionPx - quietPx), 0, 1);
  const maximumAdjustmentPx = key === "x"
    ? clamp(playerHeightPx * .045, 1.25, 3.5)
    : clamp(playerHeightPx * .025, .75, 2);
  const requestedAdjustmentPx = (estimatedRelative - currentRelative) * scale;
  const adjustmentPx = clamp(requestedAdjustmentPx, -maximumAdjustmentPx, maximumAdjustmentPx) * strength;
  return sample.stable[key] + adjustmentPx / scale;
}

function adaptiveBaselineCoordinate(
  samples: FootTrajectorySample[],
  index: number,
  key: "x" | "y",
  tracking: SamPlayerTracking,
) {
  const sample = samples[index];
  const scale = axisPixelScale(tracking, key);
  const playerHeightPx = sample.bounds.height * tracking.sourceHeight;
  const estimated = centredTrajectoryEstimateAt(samples, index, (candidate) => candidate.baseline[key]);
  const requestedPx = (estimated - sample.baseline[key]) * scale;
  const deviationPx = Math.abs(requestedPx);
  const quietPx = key === "x"
    ? clamp(playerHeightPx * .008, .35, .8)
    : clamp(playerHeightPx * .01, .45, 1);
  if (deviationPx <= quietPx) return sample.baseline[key];
  const fullCorrectionPx = key === "x"
    ? Math.max(quietPx + .8, playerHeightPx * .045)
    : Math.max(quietPx + 1, playerHeightPx * .055);
  const strength = clamp((deviationPx - quietPx) / Math.max(.001, fullCorrectionPx - quietPx), 0, 1);
  const maximumPx = key === "x"
    ? clamp(playerHeightPx * .03, 1, 2.5)
    : clamp(playerHeightPx * .018, .65, 1.5);
  return sample.baseline[key] + clamp(requestedPx, -maximumPx, maximumPx) * strength / scale;
}

function microOscillationAt(
  samples: FootTrajectorySample[],
  index: number,
  key: "x" | "y",
  tracking: SamPlayerTracking,
  maximumAmplitudePx: number,
) {
  if (index < 1 || index >= samples.length - 1) return false;
  const before = samples[index - 1];
  const current = samples[index];
  const after = samples[index + 1];
  if (!framesBelongToSameTrajectory(before, current) || !framesBelongToSameTrajectory(current, after)) return false;
  const scale = axisPixelScale(tracking, key);
  const incoming = (current.stable[key] - before.stable[key]) * scale;
  const outgoing = (after.stable[key] - current.stable[key]) * scale;
  if (incoming * outgoing >= 0) return false;
  const progress = (current.time - before.time) / Math.max(.001, after.time - before.time);
  const neighbourLine = before.stable[key] + (after.stable[key] - before.stable[key]) * progress;
  const excursionPx = Math.abs(current.stable[key] - neighbourLine) * scale;
  return Math.min(Math.abs(incoming), Math.abs(outgoing)) <= maximumAmplitudePx
    && excursionPx <= maximumAmplitudePx * 1.35;
}

/**
 * Distant players expose one-pixel changes in the SAM lower contour as a
 * visible Ring tremor. This zero-phase pass fills only that micro-jitter
 * dead-zone: it smooths the foot offset relative to the body and isolated
 * subpixel reversals, while leaving large players and real direction changes
 * untouched.
 */
function stabiliseSmallPlayerMicroJitter(
  samples: FootTrajectorySample[],
  tracking: SamPlayerTracking,
) {
  if (samples.length < 3) return 0;
  const heights = samples.map((sample) => sample.bounds.height * tracking.sourceHeight).sort((left, right) => left - right);
  const medianHeightPx = heights[Math.floor(heights.length / 2)];
  const smallPlayerStrength = clamp((68 - medianHeightPx) / 20, 0, 1);
  if (smallPlayerStrength <= 0) return 0;

  let changedFrames = 0;
  const residualSnapshot = samples.map((sample) => ({ ...sample, stable: { ...sample.stable } }));
  samples.forEach((sample, index) => {
    let changed = false;
    for (const key of ["x", "y"] as const) {
      const scale = axisPixelScale(tracking, key);
      const maximumMicroPx = clamp(medianHeightPx * (key === "x" ? .045 : .05), 1.25, 2.25);
      const currentRelative = relativeGroundCoordinate(residualSnapshot[index], key);
      const estimatedRelative = centredTrajectoryEstimateAt(
        residualSnapshot,
        index,
        (candidate) => relativeGroundCoordinate(candidate, key),
      );
      const differencePx = Math.abs(estimatedRelative - currentRelative) * scale;
      if (differencePx < .08 || differencePx > maximumMicroPx) continue;
      const correctionStrength = smallPlayerStrength * (key === "y" ? .88 : .78);
      sample.stable[key] += (estimatedRelative - currentRelative) * correctionStrength;
      changed = true;
    }
    if (changed) changedFrames += 1;
  });

  // A second snapshot handles tiny reversals inherited from the SAM bounds
  // themselves. The centred estimate has no phase delay and is used only when
  // the current sample is a local excursion no larger than a couple of pixels.
  const positionSnapshot = samples.map((sample) => ({ ...sample, stable: { ...sample.stable } }));
  samples.forEach((sample, index) => {
    let changed = false;
    for (const key of ["x", "y"] as const) {
      const scale = axisPixelScale(tracking, key);
      const maximumMicroPx = clamp(medianHeightPx * (key === "x" ? .04 : .055), 1.2, 2.4);
      const estimated = centredTrajectoryEstimateAt(positionSnapshot, index, (candidate) => candidate.stable[key]);
      const differencePx = Math.abs(estimated - positionSnapshot[index].stable[key]) * scale;
      const shouldCorrect = key === "y"
        ? differencePx >= .08 && differencePx <= maximumMicroPx * 1.75
        : microOscillationAt(positionSnapshot, index, key, tracking, maximumMicroPx)
          && differencePx <= maximumMicroPx * 1.35;
      if (!shouldCorrect) continue;
      const boundedCorrection = clamp(
        estimated - positionSnapshot[index].stable[key],
        -maximumMicroPx / scale,
        maximumMicroPx / scale,
      );
      sample.stable[key] += boundedCorrection
        * smallPlayerStrength
        * (key === "y" ? .9 : .8);
      changed = true;
    }
    if (changed) changedFrames += 1;
  });

  samples.forEach((sample) => {
    const maximumHorizontalDistance = clamp(medianHeightPx * .1, 3, 6) / tracking.sourceWidth;
    const maximumVerticalDistance = clamp(medianHeightPx * .08, 2.5, 4) / tracking.sourceHeight;
    sample.stable.x = clamp(
      sample.stable.x,
      Math.max(sample.bounds.x, sample.raw.x - maximumHorizontalDistance),
      Math.min(sample.bounds.x + sample.bounds.width, sample.raw.x + maximumHorizontalDistance),
    );
    sample.stable.y = clamp(sample.stable.y, sample.raw.y - maximumVerticalDistance, sample.raw.y + maximumVerticalDistance);
    sample.stable.y = clamp(sample.stable.y, 0, 1);
  });
  return changedFrames;
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
      return {
        frameIndex: frame.frameIndex,
        time,
        bounds: frame.bounds,
        baseline: {
          x: frame.bounds.x + frame.bounds.width / 2,
          y: frame.bounds.y + frame.bounds.height,
        },
        raw,
        stable: raw,
      };
    })
    .filter((sample): sample is FootTrajectorySample => Boolean(sample));

  const corrected = samples.map((sample) => ({ ...sample, stable: { ...sample.raw } }));
  let correctedOutliers = 0;
  for (let index = 1; index < corrected.length - 1; index += 1) {
    const before = corrected[index - 1];
    const current = corrected[index];
    const after = corrected[index + 1];
    if (!framesBelongToSameTrajectory(before, current) || !framesBelongToSameTrajectory(current, after)) continue;
    const progress = (current.time - before.time) / (after.time - before.time);
    const expected = mixPoint(before.raw, after.raw, progress);
    const expectedBaseline = mixPoint(before.baseline, after.baseline, progress);
    const averageHeightPx = (before.bounds.height + current.bounds.height + after.bounds.height)
      / 3 * tracking.sourceHeight;
    const currentBaselineDeviationPx = pixelDistance(current.baseline, expectedBaseline, tracking);
    const currentGroundDeviationPx = pixelDistance(current.raw, expected, tracking);
    const neighbourMovementPx = pixelDistance(before.raw, after.raw, tracking);
    const isolatedBodyThresholdPx = clamp(averageHeightPx * .1, 2.5, 12);

    // A very occasional SAM bounds jump moves both the body and feet together.
    // Correct it only when it is an isolated geometric discontinuity. Normal
    // running/acceleration remains untouched and is handled from current-time
    // bounds below, so this cannot create systematic tracking delay.
    if (currentBaselineDeviationPx > isolatedBodyThresholdPx
      && currentGroundDeviationPx > isolatedBodyThresholdPx
      && neighbourMovementPx <= Math.max(16, averageHeightPx * 1.15)) {
      const maximumX = clamp(averageHeightPx * .075, 2.5, 12) / tracking.sourceWidth;
      const maximumY = clamp(averageHeightPx * .04, 1.5, 4) / tracking.sourceHeight;
      current.baseline = {
        x: current.baseline.x + clamp(expectedBaseline.x - current.baseline.x, -maximumX, maximumX),
        y: current.baseline.y + clamp(expectedBaseline.y - current.baseline.y, -maximumY, maximumY),
      };
      current.stable = {
        x: current.stable.x + clamp(expected.x - current.stable.x, -maximumX, maximumX),
        y: current.stable.y + clamp(expected.y - current.stable.y, -maximumY, maximumY),
      };
      correctedOutliers += 1;
    }
  }

  const stablePoints = corrected.map((sample, index) => {
    const baseline = {
      x: adaptiveBaselineCoordinate(corrected, index, "x", tracking),
      y: adaptiveBaselineCoordinate(corrected, index, "y", tracking),
    };
    const relativeX = adaptiveRelativeCoordinate(corrected, index, "x", tracking) - sample.baseline.x;
    const relativeY = adaptiveRelativeCoordinate(corrected, index, "y", tracking) - sample.baseline.y;
    const safe = {
      x: baseline.x + relativeX,
      y: baseline.y + relativeY,
    };
    if (pixelDistance(sample.stable, safe, tracking) >= .5) correctedOutliers += 1;
    return {
      x: Math.max(sample.bounds.x, Math.min(sample.bounds.x + sample.bounds.width, safe.x)),
      y: Math.max(0, Math.min(1, safe.y)),
    };
  });
  stablePoints.forEach((point, index) => { corrected[index].stable = point; });
  correctedOutliers += stabiliseSmallPlayerMicroJitter(corrected, tracking);

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

function trajectoryPointAtTime(tracking: SamPlayerTracking, time: number) {
  const trajectory = buildFootTrajectory(tracking);
  if (!trajectory.samples.length) return undefined;
  const afterIndex = trajectory.samples.findIndex((sample) => sample.time >= time);
  if (afterIndex < 0) {
    const last = trajectory.samples[trajectory.samples.length - 1];
    return { raw: last.raw, stable: last.stable };
  }
  if (afterIndex === 0) {
    const first = trajectory.samples[0];
    return { raw: first.raw, stable: first.stable };
  }
  const after = trajectory.samples[afterIndex];
  const before = trajectory.samples[afterIndex - 1];
  if (!framesBelongToSameTrajectory(before, after)) {
    const nearest = Math.abs(time - before.time) <= Math.abs(after.time - time) ? before : after;
    return { raw: nearest.raw, stable: nearest.stable };
  }
  const progress = Math.max(0, Math.min(1, (time - before.time) / Math.max(.001, after.time - before.time)));
  return {
    raw: mixPoint(before.raw, after.raw, progress),
    stable: mixPoint(before.stable, after.stable, progress),
  };
}

export function samTrackedPlayerTrajectoryDiagnostics(track: PlayerTrack) {
  return track.samTracking ? buildFootTrajectory(track.samTracking).diagnostics : undefined;
}

export function samTrackedPlayerMovement(track: PlayerTrack): SamTrackedPlayerMovement | undefined {
  const tracking = track.samTracking;
  if (!tracking) return undefined;
  const start = trajectoryPointAtTime(tracking, tracking.startTime)?.stable;
  const end = trajectoryPointAtTime(tracking, tracking.endTime)?.stable;
  if (!start || !end) return undefined;
  return { start, end, distance: pointDistance(start, end) };
}

/**
 * The recorded, stabilised ground path. Consumers can visualise this path but
 * must not mutate it: it is the same path the tracked Ring already follows.
 */
export function samTrackedPlayerPath(track: PlayerTrack): SamTrackedPlayerPathPoint[] {
  if (!track.samTracking) return [];
  return buildFootTrajectory(track.samTracking).samples.map((sample) => ({
    time: sample.time,
    foot: { ...sample.stable },
  }));
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
  // Mask lookup remains frame-exact, while the already calculated Ring path
  // is interpolated using the original media timestamps. This makes movement
  // continuous at display refresh rates above the source FPS without changing
  // SAM frames, tracking synchronisation or making additional API requests.
  const trajectoryState = trajectoryPointAtTime(tracking, currentTime);
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
