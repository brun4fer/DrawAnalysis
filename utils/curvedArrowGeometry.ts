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
  const bodyEnd = sampleAtLength(samples, bodyEndLength);
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

  const tipSample = samples.at(-1)!;
  const tangent = normalizedVector(tipSample.tangentX, tipSample.tangentY);
  const normal = { x: -tangent.y, y: tangent.x };
  const tail = {
    x: tipSample.x - tangent.x * headLength,
    y: tipSample.y - tangent.y * headLength,
  };
  const shoulder = {
    x: tipSample.x - tangent.x * headLength * .82,
    y: tipSample.y - tangent.y * headLength * .82,
  };
  const tailLeft = { x: tail.x + normal.x * halfBody, y: tail.y + normal.y * halfBody };
  const tailRight = { x: tail.x - normal.x * halfBody, y: tail.y - normal.y * halfBody };
  const shoulderLeft = { x: shoulder.x + normal.x * headWidth / 2, y: shoulder.y + normal.y * headWidth / 2 };
  const shoulderRight = { x: shoulder.x - normal.x * headWidth / 2, y: shoulder.y - normal.y * headWidth / 2 };
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
    tailLeft,
    shoulderLeft,
    tip,
    shoulderRight,
    tailRight,
    ...[...rightEdge].reverse(),
    ...startCap,
  ];
  const upperIsLeft = (leftEdge.at(Math.floor(leftEdge.length / 2))?.y ?? 0) <= (rightEdge.at(Math.floor(rightEdge.length / 2))?.y ?? 0);
  const highlight = upperIsLeft
    ? [...leftEdge, tailLeft, shoulderLeft, tip]
    : [...rightEdge, tailRight, shoulderRight, tip];

  return {
    polygon: flatten(polygonPoints),
    highlight: flatten(highlight),
    centerline: flatten(samples),
    totalLength: fullLength,
    headLength,
    headWidth,
  };
}
