export interface RecordedSamClip {
  blob: Blob;
  width: number;
  height: number;
  frameRate: number;
  duration: 2 | 3;
  sourceStartTime: number;
}

const FRAME_RATE = 25;
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

export async function recordSamTrackingClip(video: HTMLVideoElement, duration: 2 | 3, sourceStartTime: number, signal?: AbortSignal): Promise<RecordedSamClip> {
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
  const stream = canvas.captureStream(FRAME_RATE);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  let frameHandle = 0;
  let stopped = false;
  let rejectRecording: ((reason?: unknown) => void) | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frameHandle && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frameHandle);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
  };
  const onAbort = () => { rejectRecording?.(new DOMException("Tracking cancelado.", "AbortError")); stop(); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await seekVideo(video, sourceStartTime);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const completed = new Promise<Blob>((resolve, reject) => {
      rejectRecording = reject;
      recorder.onerror = () => reject(new Error("O browser não conseguiu codificar o excerto MP4."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
      const deadline = sourceStartTime + duration;
      const drawFrame = () => {
        if (signal?.aborted) return;
        try { context.drawImage(video, 0, 0, canvas.width, canvas.height); }
        catch { reject(new Error("O browser bloqueou a leitura do vídeo. Confirme o CORS do Cloudflare R2.")); stop(); return; }
        if (video.currentTime >= deadline - .012) { stop(); return; }
        frameHandle = video.requestVideoFrameCallback(drawFrame);
      };
      recorder.start(250);
      frameHandle = video.requestVideoFrameCallback(drawFrame);
      video.muted = true;
      video.loop = false;
      video.playbackRate = 1;
      void video.play().catch((error) => { reject(error); stop(); });
    });
    const timeout = window.setTimeout(stop, (duration + 4) * 1_000);
    const blob = await completed.finally(() => window.clearTimeout(timeout));
    if (!blob.size) throw new Error("O excerto MP4 ficou vazio.");
    if (blob.size > MAX_BYTES) throw new Error("O excerto excedeu 4 MB. Tente novamente num vídeo com resolução inferior.");
    return { blob, width: canvas.width, height: canvas.height, frameRate: FRAME_RATE, duration, sourceStartTime };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stream.getTracks().forEach((track) => track.stop());
    video.muted = original.muted;
    video.playbackRate = original.playbackRate;
    video.loop = original.loop;
    try { await seekVideo(video, original.currentTime); } catch { /* Keep the editor usable if restoring fails. */ }
  }
}
