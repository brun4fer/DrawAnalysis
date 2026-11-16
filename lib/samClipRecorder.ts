export interface RecordedSamClip {
  blob: Blob;
  width: number;
  height: number;
  frameRate: number;
  /** One exact original-video mediaTime for every frame explicitly pushed to the MP4. */
  sourceFrameTimes: number[];
  duration: 2 | 3;
  sourceStartTime: number;
  timings: {
    preparationMs: number;
    captureMs: number;
    finalizeMs: number;
    restoreMs: number;
    totalMs: number;
    reused: boolean;
  };
}

const MAX_BYTES = 4_000_000;

function seekVideo(video: HTMLVideoElement, time: number) {
  if (!video.seeking && Math.abs(video.currentTime - time) < .015) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("O vídeo demorou demasiado a preparar o excerto.")); }, 5_000);
    const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener("seeked", done); video.removeEventListener("error", failed); };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Não foi possível ler o vídeo para tracking.")); };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = time;
  });
}

function supportedMp4Type() {
  const candidates = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (!sorted.length) return 1 / 25;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function waitForPresentedFrame(video: HTMLVideoElement, targetTime: number, signal?: AbortSignal) {
  return new Promise<VideoFrameCallbackMetadata>((resolve, reject) => {
    let callbackId = 0;
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("O vídeo não apresentou o primeiro fotograma a tempo.")); }, 5_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", aborted);
      if (callbackId) video.cancelVideoFrameCallback(callbackId);
    };
    const aborted = () => { cleanup(); reject(new DOMException("Tracking cancelado.", "AbortError")); };
    signal?.addEventListener("abort", aborted, { once: true });
    callbackId = video.requestVideoFrameCallback((_now, metadata) => { callbackId = 0; cleanup(); resolve(metadata); });
    // Register the callback before seeking so metadata.mediaTime belongs to the frame actually presented.
    video.currentTime = targetTime;
  });
}

async function forceExactPresentedFrame(video: HTMLVideoElement, targetTime: number, signal?: AbortSignal) {
  const clamped = Math.max(0, Math.min(video.duration, targetTime));
  if (!video.seeking && Math.abs(video.currentTime - clamped) < .0001) {
    // Force a real seek before requesting the target frame. The nudge is never used as a timestamp;
    // metadata.mediaTime from the subsequently presented target frame remains the sole authority.
    const nudge = clamped > .05 ? clamped - .05 : Math.min(video.duration, clamped + .05);
    if (Math.abs(nudge - clamped) > Number.EPSILON) await seekVideo(video, nudge);
  }
  return waitForPresentedFrame(video, clamped, signal);
}

export async function recordSamTrackingClip(video: HTMLVideoElement, duration: 2 | 3, sourceStartTime: number, signal?: AbortSignal): Promise<RecordedSamClip> {
  const totalStartedAt = performance.now();
  let completedClip: RecordedSamClip | undefined;
  if (typeof MediaRecorder === "undefined") throw new Error("Este browser não consegue preparar excertos MP4 para o SAM 3.1.");
  const mimeType = supportedMp4Type();
  if (!mimeType) throw new Error("Este browser não suporta gravação MP4/H.264. Use a versão atual do Chrome ou Edge.");
  if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) throw new Error("O vídeo ainda não está pronto.");
  sourceStartTime = Math.max(0, sourceStartTime);
  if (sourceStartTime + duration > video.duration + .03) throw new Error(`O vídeo não tem ${duration} segundos disponíveis a partir deste ponto.`);

  const original = { currentTime: video.currentTime, muted: video.muted, playbackRate: video.playbackRate, loop: video.loop };
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Não foi possível preparar o excerto do vídeo.");
  if (typeof video.requestVideoFrameCallback !== "function") throw new Error("Este browser não suporta sincronização por fotograma para o tracking SAM 3.1.");
  const stream = canvas.captureStream(0);
  const canvasTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  if (!canvasTrack || typeof canvasTrack.requestFrame !== "function") throw new Error("Este browser não permite enviar cada fotograma do tracking de forma explícita.");
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_500_000 });
  const chunks: Blob[] = [];
  const sourceFrameTimes: number[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  let frameHandle = 0;
  let stopped = false;
  let captureStoppedAt = 0;
  let rejectRecording: ((reason?: unknown) => void) | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    captureStoppedAt = performance.now();
    if (frameHandle && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frameHandle);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
  };
  const onAbort = () => { rejectRecording?.(new DOMException("Tracking cancelado.", "AbortError")); stop(); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    video.pause();
    const firstFrame = await forceExactPresentedFrame(video, sourceStartTime, signal);
    sourceStartTime = firstFrame.mediaTime;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const captureStartedAt = performance.now();
    const completed = new Promise<Blob>((resolve, reject) => {
      rejectRecording = reject;
      recorder.onerror = () => reject(new Error("O browser não conseguiu codificar o excerto MP4."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
      const deadline = sourceStartTime + duration;
      const pushCurrentFrame = (mediaTime: number) => {
        const previous = sourceFrameTimes.at(-1);
        if (previous !== undefined && mediaTime <= previous + .00001) return false;
        try { context.drawImage(video, 0, 0, canvas.width, canvas.height); }
        catch { reject(new Error("O browser bloqueou a leitura do vídeo. Confirme o CORS do Cloudflare R2.")); stop(); return false; }
        sourceFrameTimes.push(mediaTime);
        canvasTrack.requestFrame();
        return true;
      };
      const drawFrame: VideoFrameRequestCallback = (_now, metadata) => {
        if (signal?.aborted) return;
        if (metadata.mediaTime > deadline + .0005) { stop(); return; }
        pushCurrentFrame(metadata.mediaTime);
        if (metadata.mediaTime >= deadline - .0005) { stop(); return; }
        frameHandle = video.requestVideoFrameCallback(drawFrame);
      };
      // A timeslice produced a new Blob every 250 ms although the clip is consumed only
      // after completion. One final chunk avoids repeated allocations without changing frames.
      recorder.start();
      pushCurrentFrame(firstFrame.mediaTime);
      frameHandle = video.requestVideoFrameCallback(drawFrame);
      video.muted = true;
      video.loop = false;
      video.playbackRate = 1;
      void video.play().catch((error) => { reject(error); stop(); });
    });
    const timeout = window.setTimeout(stop, (duration + 4) * 1_000);
    const blob = await completed.finally(() => window.clearTimeout(timeout));
    const finalizedAt = performance.now();
    if (!blob.size) throw new Error("O excerto MP4 ficou vazio.");
    if (blob.size > MAX_BYTES) throw new Error("O excerto excedeu 4 MB. Tente novamente num vídeo com resolução inferior.");
    if (sourceFrameTimes.length < 2) throw new Error("O excerto não contém fotogramas suficientes para tracking.");
    const intervals = sourceFrameTimes.slice(1).map((time, index) => time - sourceFrameTimes[index]);
    const frameRate = Math.max(1, Math.min(120, 1 / median(intervals)));
    completedClip = {
      blob,
      width: canvas.width,
      height: canvas.height,
      frameRate,
      sourceFrameTimes,
      duration,
      sourceStartTime,
      timings: {
        preparationMs: captureStartedAt - totalStartedAt,
        captureMs: Math.max(0, (captureStoppedAt || finalizedAt) - captureStartedAt),
        finalizeMs: Math.max(0, finalizedAt - (captureStoppedAt || finalizedAt)),
        restoreMs: 0,
        totalMs: finalizedAt - totalStartedAt,
        reused: false,
      },
    };
    return completedClip;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stream.getTracks().forEach((track) => track.stop());
    video.muted = original.muted;
    video.playbackRate = original.playbackRate;
    video.loop = original.loop;
    const restoreStartedAt = performance.now();
    try { await seekVideo(video, original.currentTime); } catch { /* Keep the editor usable if restoring fails. */ }
    if (completedClip) {
      completedClip.timings.restoreMs = performance.now() - restoreStartedAt;
      completedClip.timings.totalMs = performance.now() - totalStartedAt;
    }
  }
}

const clipCache = new WeakMap<HTMLVideoElement, Map<string, RecordedSamClip>>();
const MAX_CACHED_CLIPS_PER_VIDEO = 3;

function clipCacheKey(video: HTMLVideoElement, duration: 2 | 3, sourceStartTime: number) {
  return [video.currentSrc || video.src, video.videoWidth, video.videoHeight, video.duration.toFixed(4), sourceStartTime.toFixed(4), duration].join("|");
}

/**
 * Reuses only a byte-identical, already prepared interval from the same video element/source.
 * The cache is memory-only, bounded and never changes the source resolution or frame count.
 */
export async function prepareSamTrackingClip(video: HTMLVideoElement, duration: 2 | 3, sourceStartTime: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Tracking cancelado.", "AbortError");
  const startedAt = performance.now();
  const key = clipCacheKey(video, duration, sourceStartTime);
  const cache = clipCache.get(video);
  const cached = cache?.get(key);
  if (cached) {
    cache?.delete(key);
    cache?.set(key, cached);
    return {
      ...cached,
      timings: {
        preparationMs: 0,
        captureMs: 0,
        finalizeMs: 0,
        restoreMs: 0,
        totalMs: performance.now() - startedAt,
        reused: true,
      },
    };
  }
  const clip = await recordSamTrackingClip(video, duration, sourceStartTime, signal);
  const target = cache ?? new Map<string, RecordedSamClip>();
  target.set(key, clip);
  while (target.size > MAX_CACHED_CLIPS_PER_VIDEO) target.delete(target.keys().next().value as string);
  if (!cache) clipCache.set(video, target);
  return clip;
}
