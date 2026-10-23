"use client";

let backendPromise: Promise<typeof import("@tensorflow/tfjs-core")> | null = null;

/** Load one shared TensorFlow.js backend for detection and segmentation. */
export function ensureTensorFlow() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-cpu");
      if (!tf.getBackend()) {
        try {
          await import("@tensorflow/tfjs-backend-webgl");
          const enabled = await tf.setBackend("webgl");
          if (!enabled) throw new Error("WebGL unavailable");
        } catch {
          await tf.setBackend("cpu");
        }
      }
      await tf.ready();
      return tf;
    })();
    backendPromise.catch(() => { backendPromise = null; });
  }
  return backendPromise;
}
