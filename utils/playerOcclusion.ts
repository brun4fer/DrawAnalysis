import type { NormalizedBox, Point } from "@/types/drawing";

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
) {
  const bodyWidth = Math.max(4, box.width * canvasWidth * Math.abs(scaleX));
  const bodyHeight = Math.max(8, box.height * canvasHeight * Math.abs(scaleY));
  const destinationX = destination.x * canvasWidth;
  const destinationY = destination.y * canvasHeight;
  const x = -bodyWidth / 2;
  const y = -bodyHeight;
  const sourceX = box.x * video.videoWidth;
  const sourceY = box.y * video.videoHeight;
  const sourceWidth = box.width * video.videoWidth;
  const sourceHeight = box.height * video.videoHeight;

  context.save();
  context.translate(destinationX, destinationY);
  context.rotate(rotation * Math.PI / 180);
  context.globalAlpha = opacity;
  context.fillStyle = "rgba(0,0,0,.42)";
  context.shadowColor = "rgba(0,0,0,.58)";
  context.shadowBlur = Math.max(5, bodyWidth * .16);
  context.beginPath();
  context.ellipse(0, Math.max(1, bodyHeight * .018), bodyWidth * .43, Math.max(2, bodyHeight * .045), 0, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  addPlayerSilhouettePath(context, x, y, bodyWidth, bodyHeight, 0, 0);
  context.clip();
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, x, y, bodyWidth, bodyHeight);
  context.restore();
}

export function drawPlayerForeground(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: NormalizedBox,
  canvasWidth: number,
  canvasHeight: number,
  foot: Point,
  ringRadiusY: number,
  occlusionWidth?: number,
) {
  const x = box.x * canvasWidth;
  const y = box.y * canvasHeight;
  const bodyWidth = box.width * canvasWidth;
  const bodyHeight = box.height * canvasHeight;
  const footX = foot.x * canvasWidth;
  const footY = foot.y * canvasHeight;
  const ringHeight = Math.max(4, ringRadiusY * canvasHeight);
  const lowerBodyWidth = Math.max(10, bodyWidth * 1.08, (occlusionWidth ?? 0) * canvasWidth * 1.12);
  context.save();
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
  context.lineTo(x + bodyWidth * .47, y + bodyHeight * .98);
  context.lineTo(x + bodyWidth * .28, y + bodyHeight * .98);
  context.closePath();
  context.moveTo(x + bodyWidth * .48, y + bodyHeight * .6);
  context.lineTo(x + bodyWidth * .62, y + bodyHeight * .57);
  context.lineTo(x + bodyWidth * .72, y + bodyHeight * .98);
  context.lineTo(x + bodyWidth * .53, y + bodyHeight * .98);
  context.closePath();
  context.moveTo(x + bodyWidth * .54, y + bodyHeight * .965);
  context.ellipse(x + bodyWidth * .36, y + bodyHeight * .965, bodyWidth * .18, bodyHeight * .045, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .82, y + bodyHeight * .965);
  context.ellipse(x + bodyWidth * .64, y + bodyHeight * .965, bodyWidth * .18, bodyHeight * .045, 0, 0, Math.PI * 2);
  context.moveTo(x + bodyWidth * .22, y + bodyHeight * .43);
  context.lineTo(x + bodyWidth * .78, y + bodyHeight * .43);
  context.lineTo(footX + lowerBodyWidth * .52, footY + ringHeight * .42);
  context.lineTo(footX - lowerBodyWidth * .52, footY + ringHeight * .42);
  context.closePath();
  context.moveTo(footX + lowerBodyWidth * .56, footY - ringHeight * .08);
  context.ellipse(footX, footY - ringHeight * .12, lowerBodyWidth * .58, Math.max(3, ringHeight * .82), 0, 0, Math.PI * 2);
  context.clip();
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvasWidth, canvasHeight);
  context.restore();
}
