"use client";

import { ensureTensorFlow } from "@/lib/tensorflow";

export interface PlayerDetection {
  bbox: [number, number, number, number];
  score: number;
}

type CocoModel = {
  detect: (
    input: HTMLVideoElement | HTMLCanvasElement,
    maxNumBoxes?: number,
    minScore?: number,
  ) => Promise<Array<{ bbox: [number, number, number, number]; class: string; score: number }>>;
};

let modelPromise: Promise<CocoModel> | null = null;

async function loadModel(): Promise<CocoModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureTensorFlow();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "mobilenet_v2" });
    })();
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

export async function detectPlayers(
  input: HTMLVideoElement | HTMLCanvasElement,
  options: { maxNumBoxes?: number; minScore?: number } = {},
): Promise<PlayerDetection[]> {
  const model = await loadModel();
  const detections = await model.detect(input, options.maxNumBoxes ?? 80, options.minScore ?? 0.14);
  return detections
    .filter((item) => item.class === "person")
    .map(({ bbox, score }) => ({ bbox, score }));
}
