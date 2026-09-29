import type { NormalizedBox, Point } from "@/types/drawing";

export function drawPlayerForeground(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: NormalizedBox,
  canvasWidth: number,
  canvasHeight: number,
  foot: Point,
  ringRadiusY: number,
) {
  const x = box.x * canvasWidth;
  const y = box.y * canvasHeight;
  const bodyWidth = box.width * canvasWidth;
  const bodyHeight = box.height * canvasHeight;
  const footX = foot.x * canvasWidth;
  const footY = foot.y * canvasHeight;
  const ringHeight = Math.max(4, ringRadiusY * canvasHeight);
  const lowerBodyWidth = Math.max(10, bodyWidth * .92);
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
  context.ellipse(footX, footY - ringHeight * .08, lowerBodyWidth * .56, Math.max(3, ringHeight * .62), 0, 0, Math.PI * 2);
  context.clip();
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvasWidth, canvasHeight);
  context.restore();
}
