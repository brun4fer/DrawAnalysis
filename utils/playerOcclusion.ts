import type { DrawingStyle, NormalizedBox, PlayerSegmentationMask, Point } from "@/types/drawing";

interface CachedImage {
  image: HTMLImageElement;
  loaded: boolean;
  callbacks: Set<() => void>;
}

const imageCache = new Map<string, CachedImage>();

function maskImage(source: string, onLoad?: () => void) {
  let cached = imageCache.get(source);
  if (!cached) {
    const image = new Image();
    cached = { image, loaded: false, callbacks: new Set() };
    imageCache.set(source, cached);
    image.onload = () => {
      cached!.loaded = true;
      cached!.callbacks.forEach((callback) => callback());
      cached!.callbacks.clear();
    };
    image.onerror = () => cached!.callbacks.clear();
    image.src = source;
  }
  if (!cached.loaded && onLoad) cached.callbacks.add(onLoad);
  return cached.loaded ? cached.image : null;
}

function drawMaskEffects(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  style: DrawingStyle | undefined,
  opacity: number,
  renderScale: number,
) {
  if (!style || opacity <= 0) return;
  const apparentSize = Math.max(2, Math.min(width, height));
  const outline = Math.min(apparentSize * .09, Math.max(0, style.strokeWidth * renderScale));
  const blur = Math.min(apparentSize * .35, Math.max(0, style.shadowBlur * renderScale));
  const maximumOffset = apparentSize * .3;
  const offsetX = clampSigned(style.shadowOffsetX * renderScale, maximumOffset);
  const offsetY = clampSigned(style.shadowOffsetY * renderScale, maximumOffset);
  const padding = Math.ceil(outline + blur * 2.5 + Math.max(Math.abs(offsetX), Math.abs(offsetY)) + 3);
  if (padding <= 0) return;

  if (style.shadowOpacity > 0 && (blur > 0 || offsetX || offsetY)) {
    const shadow = document.createElement("canvas");
    shadow.width = Math.max(1, Math.ceil(width + padding * 2));
    shadow.height = Math.max(1, Math.ceil(height + padding * 2));
    const shadowContext = shadow.getContext("2d");
    if (shadowContext) {
      shadowContext.globalAlpha = clamp01(style.shadowOpacity * opacity);
      shadowContext.filter = `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${style.shadowColor})`;
      shadowContext.drawImage(image, padding, padding, width, height);
      shadowContext.filter = "none";
      shadowContext.globalCompositeOperation = "destination-out";
      shadowContext.globalAlpha = 1;
      shadowContext.drawImage(image, padding, padding, width, height);
      context.drawImage(shadow, x - padding, y - padding);
    }
  }

  if (outline > .2) {
    const edge = document.createElement("canvas");
    edge.width = Math.max(1, Math.ceil(width + padding * 2));
    edge.height = Math.max(1, Math.ceil(height + padding * 2));
    const edgeContext = edge.getContext("2d");
    if (edgeContext) {
      const steps = 16;
      for (let index = 0; index < steps; index += 1) {
        const angle = index / steps * Math.PI * 2;
        edgeContext.drawImage(image, padding + Math.cos(angle) * outline, padding + Math.sin(angle) * outline, width, height);
      }
      edgeContext.globalCompositeOperation = "source-in";
      edgeContext.fillStyle = style.stroke;
      edgeContext.fillRect(0, 0, edge.width, edge.height);
      edgeContext.globalCompositeOperation = "destination-out";
      edgeContext.drawImage(image, padding, padding, width, height);
      context.save();
      context.globalAlpha = clamp01(opacity);
      context.drawImage(edge, x - padding, y - padding);
      context.restore();
    }
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}

function addPlayerSilhouettePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  bodyWidth: number,
  bodyHeight: number,
  footX: number,
  footY: number,
) {
  context.beginPath();
  context.ellipse(x + bodyWidth * .5, y + bodyHeight * .1, bodyWidth * .19, bodyHeight * .085, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .84, y + bodyHeight * .39);
  context.ellipse(x + bodyWidth * .5, y + bodyHeight * .39, bodyWidth * .34, bodyHeight * .25, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .81, y + bodyHeight * .73);
  context.ellipse(x + bodyWidth * .5, y + bodyHeight * .73, bodyWidth * .31, bodyHeight * .27, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .34, y + bodyHeight * .17);
  context.lineTo(x + bodyWidth * .66, y + bodyHeight * .17);
  context.lineTo(x + bodyWidth * .76, y + bodyHeight * .54);
  context.lineTo(x + bodyWidth * .62, y + bodyHeight * .63);
  context.lineTo(x + bodyWidth * .38, y + bodyHeight * .63);
  context.lineTo(x + bodyWidth * .24, y + bodyHeight * .54);
  context.closePath();
  context.moveTo(x + bodyWidth * .31, y + bodyHeight * .23);
  context.lineTo(x + bodyWidth * .16, y + bodyHeight * .52);
  context.lineTo(x + bodyWidth * .27, y + bodyHeight * .57);
  context.lineTo(x + bodyWidth * .43, y + bodyHeight * .3);
  context.closePath();
  context.moveTo(x + bodyWidth * .69, y + bodyHeight * .23);
  context.lineTo(x + bodyWidth * .84, y + bodyHeight * .52);
  context.lineTo(x + bodyWidth * .73, y + bodyHeight * .57);
  context.lineTo(x + bodyWidth * .57, y + bodyHeight * .3);
  context.closePath();
  context.moveTo(x + bodyWidth * .38, y + bodyHeight * .57);
  context.lineTo(x + bodyWidth * .52, y + bodyHeight * .6);
  context.lineTo(x + bodyWidth * .47, y + bodyHeight * .99);
  context.lineTo(x + bodyWidth * .25, y + bodyHeight * .99);
  context.closePath();
  context.moveTo(x + bodyWidth * .48, y + bodyHeight * .6);
  context.lineTo(x + bodyWidth * .62, y + bodyHeight * .57);
  context.lineTo(x + bodyWidth * .75, y + bodyHeight * .99);
  context.lineTo(x + bodyWidth * .53, y + bodyHeight * .99);
  context.closePath();
  context.moveTo(x + bodyWidth * .56, y + bodyHeight * .97);
  context.ellipse(x + bodyWidth * .36, y + bodyHeight * .97, bodyWidth * .2, bodyHeight * .045, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .84, y + bodyHeight * .97);
  context.ellipse(x + bodyWidth * .64, y + bodyHeight * .97, bodyWidth * .2, bodyHeight * .045, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .22, y + bodyHeight * .43);
  context.lineTo(x + bodyWidth * .78, y + bodyHeight * .43);
  context.lineTo(footX + bodyWidth * .56, footY + bodyHeight * .018);
  context.lineTo(footX - bodyWidth * .56, footY + bodyHeight * .018);
  context.closePath();
}

export function hidePlayerOriginal(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: NormalizedBox,
  canvasWidth: number,
  canvasHeight: number,
) {
  const bodyWidth = Math.max(4, box.width * canvasWidth);
  const bodyHeight = Math.max(8, box.height * canvasHeight);
  const paddingX = Math.max(3, bodyWidth * .48);
  const paddingTop = Math.max(2, bodyHeight * .13);
  const paddingBottom = Math.max(2, bodyHeight * .1);
  const destinationX = Math.max(0, box.x * canvasWidth - paddingX);
  const destinationY = Math.max(0, box.y * canvasHeight - paddingTop);
  const destinationRight = Math.min(canvasWidth, (box.x + box.width) * canvasWidth + paddingX);
  const destinationBottom = Math.min(canvasHeight, (box.y + box.height) * canvasHeight + paddingBottom);
  const destinationWidth = Math.max(1, destinationRight - destinationX);
  const destinationHeight = Math.max(1, destinationBottom - destinationY);

  const sourceWidth = destinationWidth / canvasWidth * video.videoWidth;
  const sourceHeight = destinationHeight / canvasHeight * video.videoHeight;
  const originalSourceX = destinationX / canvasWidth * video.videoWidth;
  const sourceY = Math.max(0, Math.min(
    video.videoHeight - sourceHeight,
    destinationY / canvasHeight * video.videoHeight,
  ));
  const sourceGap = Math.max(sourceWidth * .08, box.width * video.videoWidth * .35);
  const leftSourceX = originalSourceX - sourceWidth - sourceGap;
  const rightSourceX = originalSourceX + sourceWidth + sourceGap;
  const roomOnLeft = leftSourceX >= 0;
  const roomOnRight = rightSourceX + sourceWidth <= video.videoWidth;
  const sourceX = roomOnLeft
    ? leftSourceX
    : roomOnRight
      ? rightSourceX
      : Math.max(0, Math.min(video.videoWidth - sourceWidth, originalSourceX - sourceWidth));

  const patch = document.createElement("canvas");
  patch.width = Math.max(1, Math.ceil(destinationWidth));
  patch.height = Math.max(1, Math.ceil(destinationHeight));
  const patchContext = patch.getContext("2d");
  if (!patchContext) return;

  // Replace the complete detected area, rather than only an estimated body
  // silhouette. The feathered mask hides loose arms/legs without leaving a
  // visible rectangular repair on the pitch.
  patchContext.filter = `blur(${Math.max(1.2, bodyWidth * .075)}px)`;
  patchContext.drawImage(
    video,
    Math.max(0, Math.min(video.videoWidth - sourceWidth, sourceX)),
    sourceY,
    sourceWidth,
    sourceHeight,
    -2,
    -2,
    patch.width + 4,
    patch.height + 4,
  );
  patchContext.filter = "none";
  patchContext.globalCompositeOperation = "destination-in";
  const horizontalFeather = patchContext.createLinearGradient(0, 0, patch.width, 0);
  horizontalFeather.addColorStop(0, "rgba(0,0,0,0)");
  horizontalFeather.addColorStop(.14, "rgba(0,0,0,1)");
  horizontalFeather.addColorStop(.86, "rgba(0,0,0,1)");
  horizontalFeather.addColorStop(1, "rgba(0,0,0,0)");
  patchContext.fillStyle = horizontalFeather;
  patchContext.fillRect(0, 0, patch.width, patch.height);
  const verticalFeather = patchContext.createLinearGradient(0, 0, 0, patch.height);
  verticalFeather.addColorStop(0, "rgba(0,0,0,0)");
  verticalFeather.addColorStop(.1, "rgba(0,0,0,1)");
  verticalFeather.addColorStop(.9, "rgba(0,0,0,1)");
  verticalFeather.addColorStop(1, "rgba(0,0,0,0)");
  patchContext.fillStyle = verticalFeather;
  patchContext.fillRect(0, 0, patch.width, patch.height);

  context.save();
  context.drawImage(patch, destinationX, destinationY, destinationWidth, destinationHeight);
  context.restore();
}

export function drawMovedPlayer(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: NormalizedBox,
  canvasWidth: number,
  canvasHeight: number,
  destination: Point,
  scaleX = 1,
  scaleY = 1,
  rotation = 0,
  opacity = 1,
  segmentation?: PlayerSegmentationMask,
  sourceFoot?: Point,
  onImageLoad?: () => void,
) {
  const bodyWidth = Math.max(4, box.width * canvasWidth * Math.abs(scaleX));
  const bodyHeight = Math.max(8, box.height * canvasHeight * Math.abs(scaleY));
  const destinationX = destination.x * canvasWidth;
  const destinationY = destination.y * canvasHeight;
  if (segmentation && sourceFoot) {
    const cutout = maskImage(segmentation.cutoutDataUrl, onImageLoad);
    if (cutout) {
      const cutoutWidth = segmentation.bounds.width * canvasWidth * Math.abs(scaleX);
      const cutoutHeight = segmentation.bounds.height * canvasHeight * Math.abs(scaleY);
      const anchorX = (sourceFoot.x - segmentation.bounds.x) / Math.max(.000001, segmentation.bounds.width) * cutoutWidth;
      const anchorY = (sourceFoot.y - segmentation.bounds.y) / Math.max(.000001, segmentation.bounds.height) * cutoutHeight;
      context.save();
      context.translate(destinationX, destinationY);
      context.rotate(rotation * Math.PI / 180);
      context.globalAlpha = clamp01(opacity);
      context.drawImage(cutout, -anchorX, -anchorY, cutoutWidth, cutoutHeight);
      context.restore();
      return;
    }
  }
  const x = -bodyWidth / 2;
  const y = -bodyHeight;
  const sourceX = box.x * video.videoWidth;
  const sourceY = box.y * video.videoHeight;
  const sourceWidth = box.width * video.videoWidth;
  const sourceHeight = box.height * video.videoHeight;
  const padding = Math.max(2, Math.ceil(bodyWidth * .07));
  const cutout = document.createElement("canvas");
  cutout.width = Math.max(1, Math.ceil(bodyWidth + padding * 2));
  cutout.height = Math.max(1, Math.ceil(bodyHeight + padding * 2));
  const cutoutContext = cutout.getContext("2d");
  const mask = document.createElement("canvas");
  mask.width = cutout.width;
  mask.height = cutout.height;
  const maskContext = mask.getContext("2d");
  if (!cutoutContext || !maskContext) return;

  cutoutContext.imageSmoothingEnabled = true;
  cutoutContext.imageSmoothingQuality = "high";
  cutoutContext.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, padding, padding, bodyWidth, bodyHeight);
  maskContext.filter = `blur(${Math.max(.65, bodyWidth * .018)}px)`;
  addPlayerSilhouettePath(
    maskContext,
    padding,
    padding,
    bodyWidth,
    bodyHeight,
    padding + bodyWidth / 2,
    padding + bodyHeight,
  );
  maskContext.fillStyle = "#ffffff";
  maskContext.fill();
  maskContext.filter = "none";
  cutoutContext.globalCompositeOperation = "destination-in";
  cutoutContext.drawImage(mask, 0, 0);

  context.save();
  context.translate(destinationX, destinationY);
  context.rotate(rotation * Math.PI / 180);
  context.globalAlpha = opacity;
  context.drawImage(cutout, x - padding, y - padding);
  context.restore();
}

export function drawPlayerForeground(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: NormalizedBox,
  canvasWidth: number,
  canvasHeight: number,
  foot: Point,
  segmentation?: PlayerSegmentationMask,
  style?: DrawingStyle,
  opacity = 1,
  onImageLoad?: () => void,
) {
  if (segmentation) {
    const alpha = maskImage(segmentation.maskDataUrl, onImageLoad);
    const cutout = maskImage(segmentation.cutoutDataUrl, onImageLoad);
    if (alpha && cutout) {
      const maskX = segmentation.bounds.x * canvasWidth;
      const maskY = segmentation.bounds.y * canvasHeight;
      const maskWidth = segmentation.bounds.width * canvasWidth;
      const maskHeight = segmentation.bounds.height * canvasHeight;
      const renderScale = Math.max(.45, Math.min(3, Math.min(canvasWidth / 960, canvasHeight / 540)));
      drawMaskEffects(context, alpha, maskX, maskY, maskWidth, maskHeight, style, opacity, renderScale);
      context.save();
      context.globalAlpha = clamp01(opacity);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(cutout, maskX, maskY, maskWidth, maskHeight);
      context.restore();
      return;
    }
  }
  const x = box.x * canvasWidth;
  const y = box.y * canvasHeight;
  const bodyWidth = box.width * canvasWidth;
  const bodyHeight = box.height * canvasHeight;
  const footX = foot.x * canvasWidth;
  const footY = foot.y * canvasHeight;
  context.save();
  addPlayerSilhouettePath(context, x, y, bodyWidth, bodyHeight, footX, footY);
  context.clip();
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvasWidth, canvasHeight);
  context.restore();
}
