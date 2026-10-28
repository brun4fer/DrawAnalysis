import type { NormalizedBox } from "@/types/drawing";

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export interface PlayerRingDimensions {
  radiusX: number;
  radiusY: number;
}

/** Keep the ring proportional to the player's apparent size on the rendered frame. */
export function playerRingDimensions(
  box: NormalizedBox,
  viewportWidth: number,
  viewportHeight: number,
): PlayerRingDimensions {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const playerWidth = Math.max(1, box.width * safeWidth);
  const playerHeight = Math.max(1, box.height * safeHeight);
  const maximumRadius = Math.max(10, Math.min(64, playerHeight * .32));
  const radiusXPixels = clamp(Math.max(playerWidth * 1.25, playerHeight * .14), 9, maximumRadius);
  const radiusYPixels = clamp(radiusXPixels * .34, 3.5, Math.min(24, radiusXPixels * .48));
  return {
    radiusX: radiusXPixels / safeWidth,
    radiusY: radiusYPixels / safeHeight,
  };
}
