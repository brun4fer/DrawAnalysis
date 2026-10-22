export interface CanvasPoint {
  x: number;
  y: number;
}

interface CurveSample extends CanvasPoint {
  t: number;
  length: number;
  tangentX: number;
  tangentY: number;
}

export interface CurvedArrowGeometry {
  polygon: number[];
  highlight: number[];
  centerline: number[];
  totalLength: number;
  headLength: number;
  headWidth: number;
}

export interface PolylineArrowGeometry {
  polygon: number[];
  totalLength: number;
  headLength: number;
  headWidth: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function normalizedVector(x: number, y: number, fallback: CanvasPoint = { x: 1, y: 0 }) {
  const length = Math.hypot(x, y);
  return length > .0001 ? { x: x / length, y: y / length } : fallback;
}

export function quadraticPointAt(start: CanvasPoint, control: CanvasPoint, end: CanvasPoint, t: number): CanvasPoint {
  const clamped = clamp(t, 0, 1);
  const inverse = 1 - clamped;
  return {
    x: inverse * inverse * start.x + 2 * inverse * clamped * control.x + clamped * clamped * end.x,
    y: inverse * inverse * start.y + 2 * inverse * clamped * control.y + clamped * clamped * end.y,
  };
}

export function quadraticTangentAt(start: CanvasPoint, control: CanvasPoint, end: CanvasPoint, t: number): CanvasPoint {
  const clamped = clamp(t, 0, 1);
  return normalizedVector(
    2 * ((1 - clamped) * (control.x - start.x) + clamped * (end.x - control.x)),
    2 * ((1 - clamped) * (control.y - start.y) + clamped * (end.y - control.y)),
    normalizedVector(end.x - start.x, end.y - start.y),
  );
}

export function automaticLongBallControl(start: CanvasPoint, end: CanvasPoint, curveHeight: number, canvasHeight: number): CanvasPoint {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  let normalX = -deltaY / distance;
  let normalY = deltaX / distance;
  if (normalY > 0 || (Math.abs(normalY) < .001 && normalX > 0)) {
    normalX *= -1;
    normalY *= -1;
  }
  const arcHeight = Math.min(curveHeight * canvasHeight * 1.6, distance * .68);
  return {
    x: (start.x + end.x) / 2 + normalX * arcHeight,
    y: (start.y + end.y) / 2 + normalY * arcHeight,
  };
}

function sampleQuadratic(start: CanvasPoint, control: CanvasPoint, end: CanvasPoint, progress: number, sampleCount: number) {
  const clampedProgress = clamp(progress, .001, 1);
  const count = Math.max(8, Math.round(sampleCount * clampedProgress));
  const samples: CurveSample[] = [];
  let totalLength = 0;
  for (let index = 0; index <= count; index += 1) {
    const t = clampedProgress * index / count;
    const point = quadraticPointAt(start, control, end, t);
    const tangent = quadraticTangentAt(start, control, end, t);
    const previous = samples.at(-1);
    if (previous) totalLength += Math.hypot(point.x - previous.x, point.y - previous.y);
    samples.push({ ...point, t, length: totalLength, tangentX: tangent.x, tangentY: tangent.y });
  }
  return samples;
}

function sampleAtLength(samples: CurveSample[], targetLength: number): CurveSample {
  const target = clamp(targetLength, 0, samples.at(-1)?.length ?? 0);
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index];
    if (current.length < target) continue;
    const previous = samples[index - 1];
    const span = Math.max(.0001, current.length - previous.length);
    const ratio = (target - previous.length) / span;
    const tangent = normalizedVector(
      previous.tangentX + (current.tangentX - previous.tangentX) * ratio,
      previous.tangentY + (current.tangentY - previous.tangentY) * ratio,
    );
    return {
      x: previous.x + (current.x - previous.x) * ratio,
      y: previous.y + (current.y - previous.y) * ratio,
      t: previous.t + (current.t - previous.t) * ratio,
      length: target,
      tangentX: tangent.x,
      tangentY: tangent.y,
    };
  }
  return samples.at(-1)!;
}

function flatten(points: CanvasPoint[]) {
  return points.flatMap((point) => [point.x, point.y]);
}

export function buildPolylineArrowGeometry(points: number[], bodyWidth: number): PolylineArrowGeometry {
  const centers: Array<CanvasPoint & { length: number }> = [];
  let totalLength = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const point = { x: points[index], y: points[index + 1] };
    const previous = centers.at(-1);
    if (previous) {
      const segmentLength = Math.hypot(point.x - previous.x, point.y - previous.y);
      if (segmentLength < .001) continue;
      totalLength += segmentLength;
    }
    centers.push({ ...point, length: totalLength });
  }
  const safeBodyWidth = Math.max(1, bodyWidth);
  if (centers.length < 2 || totalLength < 2) return { polygon: [], totalLength, headLength: 0, headWidth: 0 };

  const preferredHeadLength = Math.max(safeBodyWidth * 3.2, Math.min(safeBodyWidth * 7, totalLength * .16));
  const headLength = Math.min(preferredHeadLength, totalLength * .48);
  const headWidth = Math.min(
    Math.max(safeBodyWidth * 3.2, headLength * .72),
    safeBodyWidth * 4.4,
    headLength * 1.55,
  );
  const bodyEndLength = totalLength - headLength;
  let bodyEnd = centers[0];
  let bodyEndIndex = 1;
  for (; bodyEndIndex < centers.length; bodyEndIndex += 1) {
    const current = centers[bodyEndIndex];
    if (current.length < bodyEndLength) continue;
    const previous = centers[bodyEndIndex - 1];
    const span = Math.max(.001, current.length - previous.length);
    const ratio = (bodyEndLength - previous.length) / span;
    bodyEnd = {
      x: previous.x + (current.x - previous.x) * ratio,
      y: previous.y + (current.y - previous.y) * ratio,
      length: bodyEndLength,
    };
    break;
  }
  const bodyCenters = centers.filter((point) => point.length < bodyEndLength - .001);
  bodyCenters.push(bodyEnd);
  const tip = centers.at(-1)!;
  const tangent = normalizedVector(tip.x - bodyEnd.x, tip.y - bodyEnd.y);
  const normal = { x: -tangent.y, y: tangent.x };
  const halfBody = safeBodyWidth / 2;

  const tangentAt = (index: number) => {
    if (index === bodyCenters.length - 1) return tangent;
    const previous = bodyCenters[Math.max(0, index - 1)];
    const next = bodyCenters[Math.min(bodyCenters.length - 1, index + 1)];
    return normalizedVector(next.x - previous.x, next.y - previous.y, tangent);
  };
  const leftEdge = bodyCenters.map((point, index) => {
    const direction = tangentAt(index);
    return { x: point.x - direction.y * halfBody, y: point.y + direction.x * halfBody };
  });
  const rightEdge = bodyCenters.map((point, index) => {
    const direction = tangentAt(index);
    return { x: point.x + direction.y * halfBody, y: point.y - direction.x * halfBody };
  });
  const headBaseLeft = { x: bodyEnd.x + normal.x * headWidth / 2, y: bodyEnd.y + normal.y * headWidth / 2 };
  const headBaseRight = { x: bodyEnd.x - normal.x * headWidth / 2, y: bodyEnd.y - normal.y * headWidth / 2 };

  return {
    polygon: flatten([
      ...leftEdge,
      headBaseLeft,
      { x: tip.x, y: tip.y },
      headBaseRight,
      ...[...rightEdge].reverse(),
    ]),
    totalLength,
    headLength,
    headWidth,
  };
}

export function sampleQuadraticCurve(start: CanvasPoint, control: CanvasPoint, end: CanvasPoint, sampleCount = 72) {
  return flatten(sampleQuadratic(start, control, end, 1, sampleCount));
}

export function buildCurvedArrowGeometry({
  start,
  control,
  end,
  bodyWidth,
  renderScale = 1,
  progress = 1,
}: {
  start: CanvasPoint;
  control: CanvasPoint;
  end: CanvasPoint;
  bodyWidth: number;
  renderScale?: number;
  progress?: number;
}): CurvedArrowGeometry {
  const fullSamples = sampleQuadratic(start, control, end, 1, 96);
  const fullLength = fullSamples.at(-1)?.length ?? 0;
  const samples = sampleQuadratic(start, control, end, progress, 96);
  const visibleLength = samples.at(-1)?.length ?? 0;
  const scaledBodyWidth = Math.max(2.4 * renderScale, bodyWidth);
  if (visibleLength < scaledBodyWidth * 2 || samples.length < 2) {
    return { polygon: [], highlight: [], centerline: [], totalLength: fullLength, headLength: 0, headWidth: 0 };
  }

  const idealHeadLength = clamp(fullLength * .13, 38 * renderScale, 88 * renderScale);
  const headLength = Math.min(idealHeadLength, visibleLength * .42);
  const idealHeadWidth = clamp(fullLength * .075, scaledBodyWidth * 4.1, Math.min(64 * renderScale, scaledBodyWidth * 6));
  const headWidth = Math.min(idealHeadWidth, Math.max(scaledBodyWidth * 1.35, headLength * .62), headLength * 1.6);
  const bodyEndLength = Math.max(0, visibleLength - headLength);
  const sampledBodyEnd = sampleAtLength(samples, bodyEndLength);
  const tipSample = samples.at(-1)!;
  const tangent = normalizedVector(tipSample.tangentX, tipSample.tangentY);
  const normal = { x: -tangent.y, y: tangent.x };
  const bodyEnd: CurveSample = {
    ...sampledBodyEnd,
    x: tipSample.x - tangent.x * headLength,
    y: tipSample.y - tangent.y * headLength,
    tangentX: tangent.x,
    tangentY: tangent.y,
  };
  const bodySamples = samples.filter((sample) => sample.length < bodyEndLength - .01);
  bodySamples.push(bodyEnd);

  const halfBody = scaledBodyWidth / 2;
  const leftEdge = bodySamples.map((sample) => ({
    x: sample.x - sample.tangentY * halfBody,
    y: sample.y + sample.tangentX * halfBody,
  }));
  const rightEdge = bodySamples.map((sample) => ({
    x: sample.x + sample.tangentY * halfBody,
    y: sample.y - sample.tangentX * halfBody,
  }));

  const headBaseLeft = { x: bodyEnd.x + normal.x * headWidth / 2, y: bodyEnd.y + normal.y * headWidth / 2 };
  const headBaseRight = { x: bodyEnd.x - normal.x * headWidth / 2, y: bodyEnd.y - normal.y * headWidth / 2 };
  const tip = { x: tipSample.x, y: tipSample.y };
  const firstSample = bodySamples[0];
  const startAngle = Math.atan2(firstSample.tangentY, firstSample.tangentX);
  const startCap = Array.from({ length: 5 }, (_, index) => {
    const angle = startAngle - Math.PI / 2 - Math.PI * (index + 1) / 6;
    return {
      x: firstSample.x + Math.cos(angle) * halfBody,
      y: firstSample.y + Math.sin(angle) * halfBody,
    };
  });

  const polygonPoints = [
    ...leftEdge,
    headBaseLeft,
    tip,
    headBaseRight,
    ...[...rightEdge].reverse(),
    ...startCap,
  ];
  const upperIsLeft = (leftEdge.at(Math.floor(leftEdge.length / 2))?.y ?? 0) <= (rightEdge.at(Math.floor(rightEdge.length / 2))?.y ?? 0);
  const highlight = upperIsLeft
    ? [...leftEdge, headBaseLeft, tip]
    : [...rightEdge, headBaseRight, tip];

  return {
    polygon: flatten(polygonPoints),
    highlight: flatten(highlight),
    centerline: flatten(samples),
    totalLength: fullLength,
    headLength,
    headWidth,
  };
}
