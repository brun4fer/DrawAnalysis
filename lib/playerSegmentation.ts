"use client";

import type { NormalizedBox, PlayerSegmentationMask, Point } from "@/types/drawing";
import { ensureTensorFlow } from "@/lib/tensorflow";

type BinarySegmentation = {
  width: number;
  height: number;
  data: ArrayLike<number>;
  pose?: { score?: number };
};

type BodyPixModel = {
  segmentMultiPerson: (input: HTMLCanvasElement, config: Record<string, unknown>) => Promise<BinarySegmentation[]>;
  segmentPerson: (input: HTMLCanvasElement, config: Record<string, unknown>) => Promise<BinarySegmentation>;
};

export interface PlayerSegmentationResult {
  bbox: NormalizedBox;
  foot: Point;
  mask: PlayerSegmentationMask;
  confidence: number;
}

let modelPromise: Promise<BodyPixModel> | null = null;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureTensorFlow();
      const bodyPix = await import("@tensorflow-models/body-pix");
      return bodyPix.load({
        architecture: "MobileNetV1",
        outputStride: 8,
        multiplier: 1,
        quantBytes: 2,
        modelUrl: "/models/bodypix/model-stride8.json",
      }) as Promise<BodyPixModel>;
    })();
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

function manualPlayerBox(frame: HTMLCanvasElement, click: Point): NormalizedBox {
  const height = clamp(.055 + click.y * .16, .06, .22);
  const width = height * .46 * frame.height / frame.width;
  return {
    x: clamp(click.x - width / 2, 0, 1 - width),
    y: clamp(click.y - height * .48, 0, 1 - height),
    width,
    height,
  };
}

function segmentationRegion(box: NormalizedBox): NormalizedBox {
  const left = clamp(box.x - box.width * .75, 0, 1);
  const top = clamp(box.y - box.height * .22, 0, 1);
  const right = clamp(box.x + box.width * 1.75, 0, 1);
  const bottom = clamp(box.y + box.height * 1.18, 0, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function inferenceCanvas(frame: HTMLCanvasElement, region: NormalizedBox, playerBox: NormalizedBox) {
  const sourceWidth = Math.max(1, region.width * frame.width);
  const sourceHeight = Math.max(1, region.height * frame.height);
  const playerHeight = Math.max(1, playerBox.height * frame.height);
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const maximumSide = deviceMemory >= 8 ? 1024 : deviceMemory >= 4 ? 896 : 704;
  const scaleForPlayer = clamp(320 / playerHeight, 1, 7);
  const scaleForLimit = Math.min(maximumSide / sourceWidth, maximumSide / sourceHeight);
  const scale = Math.max(.35, Math.min(scaleForPlayer, scaleForLimit));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, Math.round(sourceWidth * scale));
  canvas.height = Math.max(64, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível preparar o fotograma para segmentação.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    frame,
    region.x * frame.width,
    region.y * frame.height,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function nearestForeground(data: ArrayLike<number>, width: number, height: number, x: number, y: number) {
  const targetX = clamp(Math.round(x), 0, width - 1);
  const targetY = clamp(Math.round(y), 0, height - 1);
  const direct = targetY * width + targetX;
  if (data[direct] > 0) return { index: direct, distance: 0 };
  const maxRadius = Math.max(12, Math.round(Math.min(width, height) * .12));
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let best: { index: number; distance: number } | null = null;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const points = [
        [targetX + offset, targetY - radius],
        [targetX + offset, targetY + radius],
        [targetX - radius, targetY + offset],
        [targetX + radius, targetY + offset],
      ];
      for (const [candidateX, candidateY] of points) {
        if (candidateX < 0 || candidateX >= width || candidateY < 0 || candidateY >= height) continue;
        const index = candidateY * width + candidateX;
        if (data[index] <= 0) continue;
        const distance = Math.hypot(candidateX - targetX, candidateY - targetY);
        if (!best || distance < best.distance) best = { index, distance };
      }
    }
    if (best) return best;
  }
  return null;
}

function connectedComponent(data: ArrayLike<number>, width: number, height: number, seed: number) {
  const component = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  visited[seed] = 1;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let area = 0;
  while (head < tail) {
    const index = queue[head++];
    if (data[index] <= 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    component[index] = 1;
    area += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!offsetX && !offsetY) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!visited[next] && data[next] > 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  return area ? { data: component, area, minX, minY, maxX, maxY } : null;
}

function targetComponent(segmentations: BinarySegmentation[], clickX: number, clickY: number) {
  return segmentations.map((segmentation) => {
    const seed = nearestForeground(segmentation.data, segmentation.width, segmentation.height, clickX, clickY);
    if (!seed) return null;
    const component = connectedComponent(segmentation.data, segmentation.width, segmentation.height, seed.index);
    return component ? { segmentation, component, distance: seed.distance } : null;
  }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => left.distance - right.distance || right.component.area - left.component.area)[0] ?? null;
}

function createMaskAssets(
  frame: HTMLCanvasElement,
  region: NormalizedBox,
  segmentation: BinarySegmentation,
  component: NonNullable<ReturnType<typeof connectedComponent>>,
  frameTime: number,
  method: PlayerSegmentationMask["method"],
  detectionConfidence: number,
) {
  const padding = Math.max(2, Math.round(Math.max(component.maxX - component.minX, component.maxY - component.minY) * .012));
  const left = Math.max(0, component.minX - padding);
  const top = Math.max(0, component.minY - padding);
  const right = Math.min(segmentation.width - 1, component.maxX + padding);
  const bottom = Math.min(segmentation.height - 1, component.maxY + padding);
  const maskWidth = right - left + 1;
  const maskHeight = bottom - top + 1;
  const hardMask = document.createElement("canvas");
  hardMask.width = maskWidth;
  hardMask.height = maskHeight;
  const hardContext = hardMask.getContext("2d");
  if (!hardContext) throw new Error("Não foi possível criar a máscara do jogador.");
  const pixels = hardContext.createImageData(maskWidth, maskHeight);
  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const sourceIndex = (top + y) * segmentation.width + left + x;
      if (!component.data[sourceIndex]) continue;
      const targetIndex = (y * maskWidth + x) * 4;
      pixels.data[targetIndex] = 255;
      pixels.data[targetIndex + 1] = 255;
      pixels.data[targetIndex + 2] = 255;
      pixels.data[targetIndex + 3] = 255;
    }
  }
  hardContext.putImageData(pixels, 0, 0);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskWidth;
  maskCanvas.height = maskHeight;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) throw new Error("Não foi possível suavizar a máscara do jogador.");
  maskContext.filter = "blur(0.65px)";
  maskContext.globalAlpha = .42;
  maskContext.drawImage(hardMask, 0, 0);
  maskContext.filter = "none";
  maskContext.globalAlpha = 1;
  maskContext.drawImage(hardMask, 0, 0);

  const bounds = {
    x: region.x + left / segmentation.width * region.width,
    y: region.y + top / segmentation.height * region.height,
    width: maskWidth / segmentation.width * region.width,
    height: maskHeight / segmentation.height * region.height,
  };
  const cutoutCanvas = document.createElement("canvas");
  cutoutCanvas.width = maskWidth;
  cutoutCanvas.height = maskHeight;
  const cutoutContext = cutoutCanvas.getContext("2d");
  if (!cutoutContext) throw new Error("Não foi possível recortar o jogador.");
  cutoutContext.imageSmoothingEnabled = true;
  cutoutContext.imageSmoothingQuality = "high";
  cutoutContext.drawImage(
    frame,
    bounds.x * frame.width,
    bounds.y * frame.height,
    bounds.width * frame.width,
    bounds.height * frame.height,
    0,
    0,
    maskWidth,
    maskHeight,
  );
  cutoutContext.globalCompositeOperation = "destination-in";
  cutoutContext.drawImage(maskCanvas, 0, 0);

  const actualBox: NormalizedBox = {
    x: region.x + component.minX / segmentation.width * region.width,
    y: region.y + component.minY / segmentation.height * region.height,
    width: (component.maxX - component.minX + 1) / segmentation.width * region.width,
    height: (component.maxY - component.minY + 1) / segmentation.height * region.height,
  };
  const groundStart = component.maxY - Math.max(2, Math.round((component.maxY - component.minY) * .08));
  let groundX = 0;
  let groundCount = 0;
  for (let y = Math.max(component.minY, groundStart); y <= component.maxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      if (!component.data[y * segmentation.width + x]) continue;
      groundX += x;
      groundCount += 1;
    }
  }
  const foot = {
    x: clamp(region.x + (groundCount ? groundX / groundCount : (component.minX + component.maxX) / 2) / segmentation.width * region.width, 0, 1),
    y: clamp(region.y + (component.maxY + 1) / segmentation.height * region.height, 0, 1),
  };
  const fillRatio = component.area / Math.max(1, (component.maxX - component.minX + 1) * (component.maxY - component.minY + 1));
  const touchesBoundary = component.minX <= 1 || component.minY <= 1 || component.maxX >= segmentation.width - 2 || component.maxY >= segmentation.height - 2;
  const apparentHeight = actualBox.height * frame.height;
  const quality = clamp(
    .36 + detectionConfidence * .34 + Math.min(1, apparentHeight / 90) * .18 + Math.min(.12, fillRatio * .18) - (touchesBoundary ? .16 : 0),
    .18,
    .98,
  );
  const mask: PlayerSegmentationMask = {
    bounds,
    maskDataUrl: maskCanvas.toDataURL("image/png"),
    cutoutDataUrl: cutoutCanvas.toDataURL("image/png"),
    width: maskWidth,
    height: maskHeight,
    frameTime,
    quality,
    method,
  };
  return { bbox: actualBox, foot, mask, confidence: quality };
}

/** Segment only the player selected by the click in one captured video frame. */
export async function segmentPlayerAtPoint(
  frame: HTMLCanvasElement,
  click: Point,
  detectedBox: NormalizedBox | undefined,
  detectionConfidence: number,
  frameTime: number,
): Promise<PlayerSegmentationResult | null> {
  const startedAt = performance.now();
  const playerBox = detectedBox ?? manualPlayerBox(frame, click);
  const region = segmentationRegion(playerBox);
  const input = inferenceCanvas(frame, region, playerBox);
  const clickX = (click.x - region.x) / region.width * input.width;
  const clickY = (click.y - region.y) / region.height * input.height;
  const model = await loadModel();
  const shared = {
    flipHorizontal: false,
    internalResolution: "full",
    segmentationThreshold: .56,
    maxDetections: 5,
    scoreThreshold: .12,
    nmsRadius: 18,
    minKeypointScore: .12,
    refineSteps: 15,
  };
  const instances = await model.segmentMultiPerson(input, shared);
  let selected = targetComponent(instances, clickX, clickY);
  let method: PlayerSegmentationMask["method"] = "bodypix-instance";
  if (!selected) {
    const semantic = await model.segmentPerson(input, shared);
    selected = targetComponent([semantic], clickX, clickY);
    method = "bodypix-semantic";
  }
  if (!selected) return null;
  const result = createMaskAssets(frame, region, selected.segmentation, selected.component, frameTime, method, detectionConfidence);
  result.mask.analysisMs = Math.round(performance.now() - startedAt);
  return result;
}
