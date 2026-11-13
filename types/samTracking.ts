import type { SegmentationMaskEncoding } from "@meta-sam/parser";

export interface SamTrackPrompt {
  point: { x: number; y: number };
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface SamTrackFrameResult {
  frameIndex: number;
  bounds: { left: number; top: number; right: number; bottom: number };
  mask: {
    encoding: SegmentationMaskEncoding;
    payload: string;
    width: number;
    height: number;
  };
  confidence: number | null;
}

export interface SamTrackResult {
  frame: { width: number; height: number };
  frameRate: number;
  duration: 2 | 3;
  frames: SamTrackFrameResult[];
  requestId?: string;
}
