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
  duration: number;
  frames: SamTrackFrameResult[];
  requestId?: string;
  timings?: SamTrackServerTimings;
}

export interface SamTrackServerTimings {
  requestParseMs: number;
  metaUploadMs: number;
  metaProcessingMs: number;
  firstMaskMs?: number;
  maskConversionMs: number;
  serverTotalMs: number;
  inputBytes: number;
  framesReceived: number;
}

export type SamTrackingProgressStage =
  | "request-received"
  | "meta-upload"
  | "meta-processing"
  | "mask-conversion";

export interface SamTrackingProgress {
  stage: SamTrackingProgressStage;
  elapsedMs: number;
  framesReceived?: number;
  expectedFrames?: number;
}

export interface SamTrackClientTimings {
  browserUploadMs: number;
  responseStreamMs: number;
  apiRoundTripMs: number;
}

export interface SamTrackingExecution {
  result: SamTrackResult;
  timings: SamTrackClientTimings;
}

export type SamTrackingStreamEvent =
  | { type: "progress"; progress: SamTrackingProgress }
  | { type: "result"; result: SamTrackResult }
  | { type: "error"; error: { code: string; message: string; retryable: boolean; requestId?: string } };

export interface SamTrackingPerformanceReport {
  totalMs: number;
  clipPreparationMs: number;
  clipCaptureMs: number;
  clipFinalizeMs: number;
  clipRestoreMs: number;
  browserTransferMs: number;
  requestParseMs: number;
  metaUploadMs: number;
  metaProcessingMs: number;
  maskConversionMs: number;
  clientConversionMs: number;
  previewPreparationMs: number;
  responseOverheadMs: number;
  reusedClip: boolean;
  reusedTracking: boolean;
}
