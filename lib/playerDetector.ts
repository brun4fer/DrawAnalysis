"use client";

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
      const tf = await import("@tensorflow/tfjs-core");
      // COCO-SSD uses CPU kernels for non-maximum suppression even when the
      // model itself runs through WebGL, so both registries must be loaded.
      await import("@tensorflow/tfjs-backend-cpu");
      try {
        await import("@tensorflow/tfjs-backend-webgl");
        const enabled = await tf.setBackend("webgl");
        if (!enabled) throw new Error("WebGL indisponível");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "mobilenet_v2" });
    })();
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

export async function detectPlayers(input: HTMLVideoElement | HTMLCanvasElement): Promise<PlayerDetection[]> {
  const model = await loadModel();
  const detections = await model.detect(input, 50, 0.18);
  return detections
    .filter((item) => item.class === "person")
    .map(({ bbox, score }) => ({ bbox, score }));
}
