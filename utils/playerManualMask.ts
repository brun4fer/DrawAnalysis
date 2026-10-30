import type { NormalizedBox, PlayerSegmentationMask, PlayerTrackSample, Point } from "@/types/drawing";

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export interface ManualMaskAnalysis {
  pixelBounds: { x: number; y: number; width: number; height: number };
  bbox: NormalizedBox;
  foot: Point;
  pixelCount: number;
}

export function displayedPointToFrame(
  client: Point,
  bounds: { left: number; top: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): Point {
  return {
    x: clamp((client.x - bounds.left) / Math.max(1, bounds.width) * frameWidth, 0, Math.max(0, frameWidth - 1)),
    y: clamp((client.y - bounds.top) / Math.max(1, bounds.height) * frameHeight, 0, Math.max(0, frameHeight - 1)),
  };
}

/** Analyse an alpha plane without guessing a rectangular player silhouette. */
export function analyseManualMaskAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 8,
): ManualMaskAnalysis | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (alpha[row + x] <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixelCount += 1;
    }
  }
  if (pixelCount < 4 || maxX < minX || maxY < minY) return null;

  const pixelWidth = maxX - minX + 1;
  const pixelHeight = maxY - minY + 1;
  const footBandTop = Math.max(minY, maxY - Math.max(2, Math.round(pixelHeight * .08)));
  const bottomPixels: number[] = [];
  for (let y = footBandTop; y <= maxY; y += 1) {
    const row = y * width;
    for (let x = minX; x <= maxX; x += 1) {
      if (alpha[row + x] > threshold) bottomPixels.push(x);
    }
  }
  bottomPixels.sort((left, right) => left - right);
  const footX = bottomPixels.length
    ? bottomPixels[Math.floor(bottomPixels.length / 2)]
    : (minX + maxX) / 2;

  return {
    pixelBounds: { x: minX, y: minY, width: pixelWidth, height: pixelHeight },
    bbox: {
      x: minX / width,
      y: minY / height,
      width: pixelWidth / width,
      height: pixelHeight / height,
    },
    foot: {
      x: clamp((footX + .5) / width, 0, 1),
      y: clamp((maxY + .5) / height, 0, 1),
    },
    pixelCount,
  };
}

function alphaPlane(context: CanvasRenderingContext2D, width: number, height: number) {
  const rgba = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3];
  return alpha;
}

export function buildManualPlayerSample(
  frame: HTMLCanvasElement,
  fullFrameMask: HTMLCanvasElement,
  frameTime: number,
): PlayerTrackSample | null {
  if (!frame.width || !frame.height || frame.width !== fullFrameMask.width || frame.height !== fullFrameMask.height) return null;
  const maskContext = fullFrameMask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return null;
  const analysis = analyseManualMaskAlpha(alphaPlane(maskContext, frame.width, frame.height), frame.width, frame.height);
  if (!analysis) return null;
  const { x, y, width, height } = analysis.pixelBounds;

  const tightMask = document.createElement("canvas");
  tightMask.width = width;
  tightMask.height = height;
  tightMask.getContext("2d")?.drawImage(fullFrameMask, x, y, width, height, 0, 0, width, height);

  const cutout = document.createElement("canvas");
  cutout.width = width;
  cutout.height = height;
  const cutoutContext = cutout.getContext("2d");
  if (!cutoutContext) return null;
  cutoutContext.drawImage(frame, x, y, width, height, 0, 0, width, height);
  cutoutContext.globalCompositeOperation = "destination-in";
  cutoutContext.drawImage(tightMask, 0, 0);
  cutoutContext.globalCompositeOperation = "source-over";

  const mask: PlayerSegmentationMask = {
    bounds: analysis.bbox,
    maskDataUrl: tightMask.toDataURL("image/png"),
    cutoutDataUrl: cutout.toDataURL("image/png"),
    width,
    height,
    frameTime,
    quality: 1,
    method: "manual",
  };
  return { time: frameTime, bbox: analysis.bbox, foot: analysis.foot, confidence: 1, mask };
}

interface CachedMask {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

const maskCache = new Map<string, Promise<CachedMask | null>>();

function loadMask(mask: PlayerSegmentationMask) {
  const cached = maskCache.get(mask.maskDataUrl);
  if (cached) return cached;
  const pending = new Promise<CachedMask | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || mask.width;
      canvas.height = image.naturalHeight || mask.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { resolve(null); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({ width: canvas.width, height: canvas.height, alpha: alphaPlane(context, canvas.width, canvas.height) });
    };
    image.onerror = () => resolve(null);
    image.src = mask.maskDataUrl;
  });
  maskCache.set(mask.maskDataUrl, pending);
  return pending;
}

/** Exact mask hit-test, with a tiny tolerance suitable for clicking beside the feet. */
export async function pointHitsPlayerMask(mask: PlayerSegmentationMask, point: Point, tolerance = 3) {
  const { bounds } = mask;
  const localX = (point.x - bounds.x) / Math.max(.000001, bounds.width);
  const localY = (point.y - bounds.y) / Math.max(.000001, bounds.height);
  const loaded = await loadMask(mask);
  if (!loaded) return false;
  const x = Math.round(localX * (loaded.width - 1));
  const y = Math.round(localY * (loaded.height - 1));
  if (x < -tolerance || x >= loaded.width + tolerance || y < -tolerance || y >= loaded.height + tolerance) return false;
  for (let offsetY = -tolerance; offsetY <= tolerance; offsetY += 1) {
    for (let offsetX = -tolerance; offsetX <= tolerance; offsetX += 1) {
      const sampleX = x + offsetX;
      const sampleY = y + offsetY;
      if (sampleX < 0 || sampleY < 0 || sampleX >= loaded.width || sampleY >= loaded.height) continue;
      if (loaded.alpha[sampleY * loaded.width + sampleX] > 8) return true;
    }
  }
  return false;
}

export async function paintStoredMaskOnCanvas(mask: PlayerSegmentationMask, target: HTMLCanvasElement) {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Não foi possível abrir a máscara guardada."));
    image.src = mask.maskDataUrl;
  });
  const context = target.getContext("2d");
  if (!context) return;
  const { bounds } = mask;
  context.drawImage(
    image,
    bounds.x * target.width,
    bounds.y * target.height,
    bounds.width * target.width,
    bounds.height * target.height,
  );
}
