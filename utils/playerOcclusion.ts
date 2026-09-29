import type { NormalizedBox } from "@/types/drawing";

export function drawPlayerForeground(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: NormalizedBox,
  canvasWidth: number,
  canvasHeight: number,
) {
  const sourceX = box.x * video.videoWidth;
  const sourceY = box.y * video.videoHeight;
  const sourceWidth = box.width * video.videoWidth;
  const sourceHeight = box.height * video.videoHeight;
  const x = box.x * canvasWidth;
  const y = box.y * canvasHeight;
  const bodyWidth = box.width * canvasWidth;
  const bodyHeight = box.height * canvasHeight;
  context.save();
  context.beginPath();
  context.ellipse(x + bodyWidth * .5, y + bodyHeight * .1, bodyWidth * .19, bodyHeight * .085, 0, 0, Math.PI * 2);
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
  context.clip();
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, x, y, bodyWidth, bodyHeight);
  context.restore();
}
