import type { SegmentationMaskEncoding } from "@meta-sam/parser";

export interface SamSegmentRequest {
  imageDataUrl: string;
  frame: { width: number; height: number };
  promptMode: "point" | "box";
  point?: { x: number; y: number };
  box?: { left: number; top: number; right: number; bottom: number };
}

export interface SamSegmentResult {
  frame: { width: number; height: number };
  bounds: { left: number; top: number; right: number; bottom: number };
  mask: {
    encoding: SegmentationMaskEncoding;
    payload: string;
    width: number;
    height: number;
  };
  confidence: number | null;
  requestId?: string;
}

export interface SamErrorResponse {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId?: string;
  };
}
