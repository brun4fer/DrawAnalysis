import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appOrigin = new URL(process.argv[2] || "http://localhost:3000").origin;
const detectedChromePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!detectedChromePath) throw new Error("Chrome ou Edge não está instalado para executar o teste real do browser.");
const chromePath: string = detectedChromePath;

const username = process.env.INITIAL_ADMIN_USERNAME;
const password = process.env.INITIAL_ADMIN_PASSWORD;
if (!username || !password) throw new Error("Faltam credenciais locais para o teste autenticado.");

const port = 9339;

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function browserTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
      const target = targets.find((item) => item.type === "page" && item.url.startsWith(appOrigin));
      if (target) return target;
    } catch { /* Browser is still starting. */ }
    await wait(250);
  }
  throw new Error("O browser de teste não iniciou a tempo.");
}

async function run() {
  const target = await browserTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
  let id = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id)!;
    pending.delete(message.id);
    if (message.error) handler.reject(message.error);
    else handler.resolve(message.result);
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("Falha ao ligar ao browser de teste."));
  });
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<unknown>((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
  await send("Runtime.enable");
  await wait(1_000);

  const browserTestSource = async function cloudBrowserTest(settings: { appOrigin: string; username: string; password: string }) {
    const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const timeout = (milliseconds: number, message: string) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds));
    const api = async <T,>(path: string, init?: RequestInit) => {
      const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
      const body = await response.json().catch(() => ({})) as T & { error?: string };
      if (!response.ok) throw new Error(`${body.error || "API rejeitou o pedido"} [${init?.method || "GET"} ${path} → HTTP ${response.status}]`);
      return { response, body };
    };

    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: settings.username, password: settings.password }) });
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const canvasStream = canvas.captureStream(20);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const audioDestination = audioContext.createMediaStreamDestination();
    oscillator.frequency.value = 440;
    gain.gain.value = .05;
    oscillator.connect(gain).connect(audioDestination);
    oscillator.start();
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
    const mimeType = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"].find((value) => MediaRecorder.isTypeSupported(value))!;
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 450_000, audioBitsPerSecond: 48_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("MediaRecorder falhou."));
    });
    recorder.start(250);
    const startedAt = performance.now();
    while (performance.now() - startedAt < 10_050) {
      const seconds = (performance.now() - startedAt) / 1000;
      context.fillStyle = `hsl(${Math.round(seconds * 32) % 360} 75% 34%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "white";
      context.font = "bold 28px sans-serif";
      context.fillText(`Cloud ${seconds.toFixed(1)} s`, 42, 98);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    recorder.stop();
    await stopped;
    oscillator.stop();
    await audioContext.close();
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: mimeType });
    const fileName = `cloud-production-validation-10s-${Date.now()}.webm`;
    const init = await api<{ asset: { id: string }; uploadId: string | null; partSize: number; completedParts: Array<{ partNumber: number }>; alreadyReady: boolean }>("/api/media-library/uploads", {
      method: "POST",
      body: JSON.stringify({ fileName, fileSize: blob.size, durationSeconds: 10, mimeType, lastModified: new Date().toISOString() }),
    });
    if (!init.body.uploadId) throw new Error("O teste não recebeu uploadId.");
    const totalParts = Math.ceil(blob.size / init.body.partSize);
    const signed = await api<{ parts: Array<{ partNumber: number; url: string }> }>("/api/media-library/uploads/parts", {
      method: "POST",
      body: JSON.stringify({ assetId: init.body.asset.id, uploadId: init.body.uploadId, partNumbers: Array.from({ length: totalParts }, (_, index) => index + 1) }),
    });
    for (const part of signed.body.parts) {
      const start = (part.partNumber - 1) * init.body.partSize;
      const response = await fetch(part.url, { method: "PUT", body: blob.slice(start, Math.min(blob.size, start + init.body.partSize)) });
      if (!response.ok) throw new Error(`R2 rejeitou PUT com HTTP ${response.status}.`);
    }
    await api("/api/media-library/uploads/complete", {
      method: "POST",
      body: JSON.stringify({ assetId: init.body.asset.id, uploadId: init.body.uploadId, partSize: init.body.partSize }),
    });
    const playback = await api<{ asset: { id: string; fileName: string; durationSeconds: number }; url: string }>(`/api/media-library/${encodeURIComponent(init.body.asset.id)}/playback`);
    const direct = await fetch(playback.body.url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
    if (direct.status !== 206 && !direct.ok) throw new Error(`R2 rejeitou GET com HTTP ${direct.status}.`);
    await direct.body?.cancel();

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.src = playback.body.url;
    document.body.append(video);
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        video.oncanplay = () => resolve();
        video.onerror = () => reject(new Error(`Vídeo falhou com MEDIA_ERR ${video.error?.code || 0}.`));
      }),
      timeout(30_000, "O vídeo cloud não ficou pronto a reproduzir."),
    ]);
    video.volume = .05;
    await video.play();
    await wait(1_200);
    const captured = document.createElement("canvas");
    captured.width = video.videoWidth;
    captured.height = video.videoHeight;
    captured.getContext("2d")!.drawImage(video, 0, 0);
    const audioTracks = (video as HTMLVideoElement & { captureStream: () => MediaStream })
      .captureStream()
      .getAudioTracks().length;
    const result = {
      appOrigin: settings.appOrigin,
      uploaded: true,
      reopened: true,
      playing: !video.paused && video.currentTime > .5,
      duration: video.duration,
      dimensions: `${video.videoWidth}x${video.videoHeight}`,
      audioTracks,
      canvasReadable: captured.toDataURL("image/jpeg", .5).startsWith("data:image/jpeg"),
      fileName,
      fileSize: blob.size,
      mimeType,
    };
    video.pause();
    video.remove();
    return result;
  }.toString();
  // tsx/esbuild may add this harmless naming helper to Function#toString output.
  const expression = `(() => { const __name = (target) => target; return (${browserTestSource})(${JSON.stringify({ appOrigin, username, password })}); })()`;

  const evaluated = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }) as {
    result?: { value?: unknown; description?: string };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };
  socket.close();
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text || "Teste do browser falhou.");
  console.log(evaluated.result?.value);
}

async function main() {
  const profile = await mkdtemp(join(tmpdir(), "draw-analysis-cloud-test-"));
  const browser = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--disable-default-apps",
    `${appOrigin}/login`,
  ], { stdio: "ignore", windowsHide: true });
  try {
    await run();
  } finally {
    if (browser.exitCode === null) {
      const exited = new Promise<void>((resolve) => browser.once("exit", () => resolve()));
      browser.kill();
      await Promise.race([exited, wait(5_000)]);
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
