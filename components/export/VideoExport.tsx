"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileVideo2, LoaderCircle, X, XCircle } from "lucide-react";
import { DrawingPreviewCanvas } from "@/components/canvas/DrawingPreviewCanvas";
import { APP_PRODUCT } from "@/lib/product";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import type { AnalysisSlide, VideoSlideContent } from "@/types/slide";
import { freezeFramesInsideClip, getSlidePresentationDuration, sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";
import { slideBackgroundVideoUrl } from "@/utils/slideMedia";
import { hexToRgba } from "@/utils/color";

interface Props {
  slides: AnalysisSlide[];
  selectedSlideId: string | null;
  projectName: string;
  onClose: () => void;
}

const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 720;
const FPS = 25;

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "apresentacao";
}

function recordingFormat() {
  if (typeof MediaRecorder === "undefined") throw new Error("Este browser não permite exportar vídeo.");
  const formats = [
    { mime: "video/mp4", extension: "mp4" },
    { mime: "video/mp4;codecs=avc1.64003E,mp4a.40.2", extension: "mp4" },
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mime: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mime: "video/webm", extension: "webm" },
  ] as const;
  const selected = formats.find((format) => MediaRecorder.isTypeSupported(format.mime));
  if (!selected) throw new Error("Não foi encontrado um formato de vídeo compatível neste browser.");
  return selected;
}

function describeError(value: unknown) {
  if (value instanceof DOMException) return `${value.name}: ${value.message}`;
  if (value instanceof Error) return value.message || value.name;
  if (value instanceof Event) {
    const recorderError = (value as Event & { error?: DOMException }).error;
    if (recorderError) return `${recorderError.name}: ${recorderError.message}`;
    return `Evento ${value.type || "desconhecido"}`;
  }
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function mediaPlaybackError(video: HTMLVideoElement) {
  if (!video.error) return null;
  const messages: Record<number, string> = {
    1: "a reprodução do vídeo foi cancelada",
    2: "falha de rede durante a leitura do vídeo",
    3: "o browser não conseguiu descodificar um fotograma",
    4: "o formato original do vídeo não é suportado",
  };
  return new Error(`Erro no vídeo de origem: ${messages[video.error.code] ?? `código ${video.error.code}`}.`);
}

function waitForVideo(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("O vídeo demorou demasiado tempo a abrir.")), 20000);
    const loaded = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", loaded);
      reject(mediaPlaybackError(video) ?? new Error("Não foi possível abrir um dos vídeos."));
    };
    video.addEventListener("loadeddata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

async function prepareVideoSource(video: HTMLVideoElement, source: string, slideNumber: number) {
  video.pause();
  const sourceChanged = video.getAttribute("src") !== source;
  if (sourceChanged) {
    video.removeAttribute("src");
    video.load();
    await nextPaint();
    video.src = source;
    video.load();
  }
  try {
    await waitForVideo(video);
  } catch (error) {
    throw new Error(`Falha ao carregar o vídeo do slide ${slideNumber}: ${describeError(error)}`);
  }
  const playbackError = mediaPlaybackError(video);
  if (playbackError) throw new Error(`Falha no vídeo do slide ${slideNumber}: ${playbackError.message}`);
}

function seekVideo(video: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(video.duration || time, time));
  if (Math.abs(video.currentTime - target) < .018) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1500);
    video.addEventListener("seeked", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    video.currentTime = target;
  });
}

function drawVideoCover(context: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function slideExportDuration(slide: AnalysisSlide) {
  return getSlidePresentationDuration(slide);
}

export function VideoExport({ slides, selectedSlideId, projectName, onClose }: Props) {
  const [scope, setScope] = useState<"all" | "current">("all");
  const [gap, setGap] = useState(1);
  const [phase, setPhase] = useState<"config" | "working" | "done" | "error">("config");
  const [renderSlide, setRenderSlide] = useState<AnalysisSlide | null>(null);
  const [timelineTime, setTimelineTime] = useState(0);
  const [renderPresentationTime, setRenderPresentationTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Configure a exportação.");
  const [error, setError] = useState("");
  const [exportedExtension, setExportedExtension] = useState<"mp4" | "webm">("mp4");
  const captureRootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCaptureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const cancelledRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const registerOverlayCapture = useCallback((capture: (() => HTMLCanvasElement | null) | null) => {
    overlayCaptureRef.current = capture;
  }, []);

  const beginExport = () => {
    cancelledRef.current = false;
    const video = videoRef.current;
    if (video && !audioContextRef.current && typeof AudioContext !== "undefined") {
      try {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        audioContext.createMediaElementSource(video).connect(destination);
        audioContextRef.current = audioContext;
        audioDestinationRef.current = destination;
        void audioContext.resume();
      } catch {
        // Video export remains available without an audio track.
      }
    }
    setPhase("working");
    setProgress(0);
    setMessage("A preparar a apresentação…");
  };

  const cancel = () => {
    cancelledRef.current = true;
    setMessage("A cancelar a exportação…");
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    window.setTimeout(() => outputStreamRef.current?.getTracks().forEach((track) => track.stop()), 0);
    videoRef.current?.pause();
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    outputStreamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (phase !== "working") return;
    let disposed = false;
    const exportSlides = scope === "current"
      ? slides.filter((slide) => slide.id === selectedSlideId)
      : slides;

    const ensureActive = () => {
      if (disposed || cancelledRef.current) throw new DOMException("Exportação cancelada.", "AbortError");
    };
    const showSlide = async (slide: AnalysisSlide) => {
      setRenderPresentationTime(0);
      setRenderSlide(slide);
      await nextPaint();
      await document.fonts.ready;
      await nextPaint();
      ensureActive();
    };
    const drawCaption = (context: CanvasRenderingContext2D, slide: AnalysisSlide) => {
      const segments = (slide.captionSegments ?? []).filter((segment) => segment.text.trim());
      const caption = slide.caption.trim();
      if (!caption && !segments.length) return;
      const height = Math.round(EXPORT_HEIGHT * Math.max(.035, Math.min(.2, slide.captionHeight ?? .075)));
      const centerY = EXPORT_HEIGHT * Math.max(height / EXPORT_HEIGHT / 2, Math.min(1 - height / EXPORT_HEIGHT / 2, slide.captionPositionY ?? 1 - height / EXPORT_HEIGHT / 2));
      context.save();
      context.fillStyle = hexToRgba(slide.captionBackgroundColor, slide.captionOpacity ?? .74);
      context.fillRect(0, centerY - height / 2, EXPORT_WIDTH, height);
      context.textBaseline = "middle";
      if (segments.length) {
        const gap = Math.max(8, (slide.captionFontSize ?? 22) * .34);
        let fontSize = slide.captionFontSize ?? 22;
        const measure = () => segments.map((segment) => {
          context.font = `${segment.bold ? 900 : 500} ${fontSize}px Inter, Arial, sans-serif`;
          return context.measureText(segment.text).width;
        });
        let widths = measure();
        const availableWidth = EXPORT_WIDTH - 48;
        const unscaledWidth = widths.reduce((total, width) => total + width, 0) + gap * Math.max(0, segments.length - 1);
        if (unscaledWidth > availableWidth) {
          fontSize *= availableWidth / unscaledWidth;
          widths = measure();
        }
        const totalWidth = widths.reduce((total, width) => total + width, 0) + gap * Math.max(0, segments.length - 1);
        let x = (EXPORT_WIDTH - totalWidth) / 2;
        context.textAlign = "left";
        segments.forEach((segment, index) => {
          context.fillStyle = segment.color;
          context.font = `${segment.bold ? 900 : 500} ${fontSize}px Inter, Arial, sans-serif`;
          context.fillText(segment.text, x, centerY);
          x += widths[index] + gap;
        });
      } else {
        context.fillStyle = slide.captionTextColor ?? "#101010";
        context.font = `700 ${slide.captionFontSize ?? 22}px Inter, Arial, sans-serif`;
        context.textAlign = "center";
        context.fillText(caption, EXPORT_WIDTH / 2, centerY, EXPORT_WIDTH - 48);
      }
      context.restore();
    };
    const drawVideoFrame = (canvas: HTMLCanvasElement, video: HTMLVideoElement, slide: AnalysisSlide) => {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível criar o fotograma de exportação.");
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const overlay = overlayCaptureRef.current?.();
      if (overlay) context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      drawCaption(context, slide);
    };
    const waitFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

    const run = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível iniciar o renderizador de vídeo.");
      if (!exportSlides.length) throw new Error("Não existem slides para exportar.");
      const format = recordingFormat();
      setExportedExtension(format.extension);

      // Static slides are composed before recording starts. This prevents a
      // slow DOM/image capture from interrupting the transition between two
      // already-recorded slides.
      const preparedStaticSlides = new Map<string, HTMLCanvasElement>();
      const preparedBackgroundOverlays = new Map<string, HTMLCanvasElement>();
      const { toCanvas } = await import("html-to-image");
      for (let index = 0; index < exportSlides.length; index += 1) {
        const slide = exportSlides[index];
        if (slide.content.kind === "video" || slide.content.kind === "tactical-board") continue;
        ensureActive();
        setMessage(`A preparar slide ${index + 1}/${exportSlides.length}…`);
        await showSlide(slide);
        const backgroundVideo = slideBackgroundVideoUrl(slide);
        const root = backgroundVideo
          ? captureRootRef.current?.querySelector<HTMLElement>("[data-slide-root]")
          : captureRootRef.current?.querySelector<HTMLElement>(".slide-stage-shell");
        if (!root) throw new Error(`Não foi possível preparar o slide ${index + 1}.`);
        try {
          const prepared = await toCanvas(root, {
            width: EXPORT_WIDTH,
            height: EXPORT_HEIGHT,
            canvasWidth: EXPORT_WIDTH,
            canvasHeight: EXPORT_HEIGHT,
            pixelRatio: 1,
            cacheBust: true,
            backgroundColor: backgroundVideo ? "transparent" : "#080a0b",
            // The persistent video element is hidden on static slides, but
            // html-to-image would still try to clone its empty source and
            // reject with a generic image `error` event.
            filter: (node) => !(node instanceof HTMLVideoElement)
              && !(node instanceof HTMLElement && node.hasAttribute("data-slide-background-media")),
          });
          if (backgroundVideo) preparedBackgroundOverlays.set(slide.id, prepared);
          else preparedStaticSlides.set(slide.id, prepared);
        } catch (caught) {
          throw new Error(`Falha ao compor o slide ${index + 1}: ${describeError(caught)}`);
        }
      }

      const outputStream = canvas.captureStream(FPS);
      outputStreamRef.current = outputStream;
      const audioTrack = audioDestinationRef.current?.stream.getAudioTracks()[0];
      if (audioTrack) outputStream.addTrack(audioTrack);
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(outputStream, { mimeType: format.mime, videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 128_000 });
      recorderRef.current = recorder;
      let recorderFailure: Error | null = null;
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
        recorder.addEventListener("error", (event) => {
          const detail = describeError(event);
          recorderFailure = new Error(`O gravador do browser foi interrompido (${detail}).`);
          reject(recorderFailure);
        }, { once: true });
        recorder.addEventListener("stop", () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || format.mime });
          if (!blob.size) reject(new Error("O browser terminou a gravação sem produzir dados."));
          else resolve(blob);
        }, { once: true });
      });
      void stopped.catch(() => undefined);
      const ensureRecording = () => {
        ensureActive();
        if (recorderFailure) throw recorderFailure;
        if (recorder.state === "inactive") throw new Error("O gravador do browser parou antes de concluir a apresentação.");
      };
      const totalDuration = exportSlides.reduce((total, slide) => total + slideExportDuration(slide), 0) + Math.max(0, exportSlides.length - 1) * gap;
      let completedDuration = 0;
      const updateProgress = (elapsed: number, label: string) => {
        setProgress(Math.min(99, Math.round((completedDuration + elapsed) / Math.max(.1, totalDuration) * 100)));
        setMessage(label);
      };

      context.fillStyle = "#080a0b";
      context.fillRect(0, 0, canvas.width, canvas.height);
      // MP4 is more reliable when the browser writes a single continuous
      // fragment; WebM can safely flush intermediate chunks.
      if (format.extension === "mp4") recorder.start();
      else recorder.start(1000);
      try {
        for (let index = 0; index < exportSlides.length; index += 1) {
          const slide = exportSlides[index];
          ensureRecording();
          setMessage(`A abrir slide ${index + 1}/${exportSlides.length}…`);
          await showSlide(slide);

          if (slide.content.kind === "video") {
            const content: VideoSlideContent = slide.content;
            const video = videoRef.current;
            if (!video || !content.sourceUrl) throw new Error(`O slide ${index + 1} não tem o vídeo disponível neste dispositivo.`);
            setMessage(`A carregar vídeo do slide ${index + 1}/${exportSlides.length}…`);
            await prepareVideoSource(video, content.sourceUrl, index + 1);
            const sourceEnd = Math.max(content.startTime, Math.min(content.endTime ?? video.duration, video.duration));
            const freezes = freezeFramesInsideClip(content, sourceEnd);
            const timelineStart = sourceTimeToTimeline(content.startTime, freezes);
            const timelineEnd = sourceTimeToTimeline(sourceEnd, freezes);
            const duration = Math.max(.05, timelineEnd - timelineStart);
            await seekVideo(video, content.startTime);
            setTimelineTime(timelineStart);
            await nextPaint();
            video.muted = false;
            try { await video.play(); } catch { video.muted = true; await video.play(); }
            const startedAt = performance.now();
            while (true) {
              ensureRecording();
              const playbackError = mediaPlaybackError(video);
              if (playbackError) throw playbackError;
              const elapsed = Math.min(duration, (performance.now() - startedAt) / 1000);
              const point = timelineTimeToSource(timelineStart + elapsed, freezes);
              if (point.freeze) {
                video.pause();
                if (Math.abs(video.currentTime - point.sourceTime) > .025) await seekVideo(video, point.sourceTime);
              } else {
                if (Math.abs(video.currentTime - point.sourceTime) > .2) video.currentTime = point.sourceTime;
                if (video.paused && elapsed < duration) {
                  try { await video.play(); }
                  catch (caught) { throw new Error(`Falha ao reproduzir o slide ${index + 1}: ${describeError(caught)}`); }
                }
              }
              setTimelineTime(timelineStart + elapsed);
              await nextPaint();
              drawVideoFrame(canvas, video, slide);
              updateProgress(elapsed, `A renderizar slide ${index + 1}/${exportSlides.length} · ${Math.round(elapsed / duration * 100)}%`);
              if (elapsed >= duration) break;
              await waitFrame();
            }
            video.pause();
            completedDuration += duration;
          } else if (slide.content.kind === "tactical-board") {
            const duration = getSlidePresentationDuration(slide);
            const root = captureRootRef.current?.querySelector<HTMLElement>(".slide-stage-shell");
            if (!root) throw new Error(`O quadro tático do slide ${index + 1} não ficou preparado.`);
            const startedAt = performance.now();
            while (true) {
              ensureRecording();
              const elapsed = Math.min(duration, (performance.now() - startedAt) / 1000);
              setRenderPresentationTime(elapsed);
              await nextPaint();
              const frame = await toCanvas(root, {
                width: EXPORT_WIDTH,
                height: EXPORT_HEIGHT,
                canvasWidth: EXPORT_WIDTH,
                canvasHeight: EXPORT_HEIGHT,
                pixelRatio: 1,
                cacheBust: false,
                backgroundColor: "#080a0b",
                filter: (node) => !(node instanceof HTMLVideoElement),
              });
              context.fillStyle = "#080a0b";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(frame, 0, 0, canvas.width, canvas.height);
              drawCaption(context, slide);
              updateProgress(elapsed, `A animar quadro tático ${index + 1}/${exportSlides.length} · ${Math.round(elapsed / duration * 100)}%`);
              if (elapsed >= duration) break;
              await waitFrame();
            }
            completedDuration += duration;
          } else if (slideBackgroundVideoUrl(slide)) {
            const source = slideBackgroundVideoUrl(slide)!;
            const video = videoRef.current;
            const overlay = preparedBackgroundOverlays.get(slide.id);
            if (!video || !overlay) throw new Error(`O fundo em vídeo do slide ${index + 1} não ficou preparado.`);
            setMessage(`A carregar fundo em vídeo do slide ${index + 1}/${exportSlides.length}…`);
            await prepareVideoSource(video, source, index + 1);
            await seekVideo(video, 0);
            video.loop = true;
            video.muted = true;
            await video.play().catch(() => undefined);
            const duration = Math.max(.25, slide.duration);
            const startedAt = performance.now();
            while (true) {
              ensureRecording();
              const elapsed = Math.min(duration, (performance.now() - startedAt) / 1000);
              const backgroundTime = elapsed % Math.max(.05, video.duration);
              if (Math.abs(video.currentTime - backgroundTime) > .3) video.currentTime = backgroundTime;
              context.fillStyle = "#080a0b";
              context.fillRect(0, 0, canvas.width, canvas.height);
              drawVideoCover(context, video, canvas.width, canvas.height);
              context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
              drawCaption(context, slide);
              updateProgress(elapsed, `A renderizar slide ${index + 1}/${exportSlides.length} · ${Math.round(elapsed / duration * 100)}%`);
              if (elapsed >= duration) break;
              await waitFrame();
            }
            video.pause();
            video.loop = false;
            completedDuration += duration;
          } else {
            const image = preparedStaticSlides.get(slide.id);
            if (!image) throw new Error(`O slide ${index + 1} não ficou preparado para a exportação.`);
            const duration = Math.max(.25, slide.duration);
            const startedAt = performance.now();
            while (true) {
              ensureRecording();
              const elapsed = Math.min(duration, (performance.now() - startedAt) / 1000);
              context.fillStyle = "#080a0b";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              drawCaption(context, slide);
              updateProgress(elapsed, `A renderizar slide ${index + 1}/${exportSlides.length} · ${Math.round(elapsed / duration * 100)}%`);
              if (elapsed >= duration) break;
              await waitFrame();
            }
            completedDuration += duration;
          }

          if (index < exportSlides.length - 1 && gap > 0) {
            const startedAt = performance.now();
            while (true) {
              ensureRecording();
              const elapsed = Math.min(gap, (performance.now() - startedAt) / 1000);
              context.fillStyle = "#080a0b";
              context.fillRect(0, 0, canvas.width, canvas.height);
              updateProgress(elapsed, `Transição para o slide ${index + 2}…`);
              if (elapsed >= gap) break;
              await waitFrame();
            }
            completedDuration += gap;
          }
        }
      } finally {
        videoRef.current?.pause();
        if (recorder.state !== "inactive") recorder.stop();
      }

      setProgress(99);
      setMessage("A finalizar o ficheiro de vídeo…");
      const blob = await stopped;
      recorderRef.current = null;
      outputStream.getTracks().forEach((track) => track.stop());
      outputStreamRef.current = null;
      ensureActive();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(projectName)}.${format.extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setProgress(100);
      setMessage(`${format.extension.toUpperCase()} exportado com sucesso.`);
      setPhase("done");
    };

    void run().catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        if (!disposed) onClose();
        return;
      }
      console.error(`Falha na exportação ${APP_PRODUCT.name}`, caught);
      outputStreamRef.current?.getTracks().forEach((track) => track.stop());
      outputStreamRef.current = null;
      if (!disposed) {
        setError(describeError(caught) || "Não foi possível exportar o vídeo.");
        setMessage("A exportação não foi concluída.");
        setPhase("error");
      }
    });
    return () => { disposed = true; };
  }, [gap, onClose, phase, projectName, scope, selectedSlideId, slides]);

  const activeVideo = renderSlide?.content.kind === "video" ? renderSlide.content : null;
  const getVideoElement = useCallback(() => videoRef.current, []);
  const stateClass = phase === "config" ? "done" : phase;

  return (
    <>
      <div className="modal-backdrop powerpoint-export-backdrop">
        <section className="powerpoint-export-dialog video-export-dialog" role="dialog" aria-modal="true" aria-labelledby="video-export-title">
          <header>
            <div className={`powerpoint-export-icon state-${stateClass}`}>
              {phase === "working" ? <LoaderCircle size={23} /> : phase === "done" ? <CheckCircle2 size={23} /> : phase === "error" ? <XCircle size={23} /> : <FileVideo2 size={23} />}
            </div>
            <div><span>EXPORTAR APRESENTAÇÃO</span><h2 id="video-export-title">Vídeo MP4</h2></div>
            {phase !== "working" && <button onClick={onClose} title="Fechar"><X size={18} /></button>}
          </header>
          {phase === "config" ? (
            <div className="video-export-config">
              <label><span>O que pretende exportar?</span><select value={scope} onChange={(event) => setScope(event.target.value as "all" | "current")}><option value="all">Apresentação completa</option><option value="current">Apenas o slide atual</option></select></label>
              <label><span>Intervalo entre slides</span><div><input type="number" min={0} max={10} step={.25} value={gap} onChange={(event) => setGap(Math.max(0, Math.min(10, Number(event.target.value))))} /><i>segundos</i></div></label>
              <p>O vídeo final inclui cortes, pausas, desenhos, animações, legendas e áudio quando permitido pelo browser.</p>
            </div>
          ) : (
            <div className="powerpoint-export-body">
              <FileVideo2 size={32} />
              <strong>{message}</strong>
              <p>{phase === "working" ? "A apresentação é gravada à duração real para manter os vídeos e as animações sincronizados." : phase === "done" ? `O ficheiro .${exportedExtension} foi descarregado.` : error}</p>
              <div className="powerpoint-export-progress"><i style={{ width: `${progress}%` }} /></div>
              <small>{progress}%</small>
            </div>
          )}
          <footer>
            {phase === "config" && <><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={beginExport} disabled={scope === "current" && !selectedSlideId}>Exportar vídeo</button></>}
            {phase === "working" && <button className="secondary" onClick={cancel}>Cancelar</button>}
            {(phase === "done" || phase === "error") && <button className="primary" onClick={onClose}>Fechar</button>}
          </footer>
        </section>
      </div>

      <div ref={captureRootRef} className="powerpoint-export-capture" aria-hidden="true">
        <video ref={videoRef} crossOrigin="anonymous" playsInline preload="auto" style={{ display: activeVideo ? "block" : "none", width: EXPORT_WIDTH, height: EXPORT_HEIGHT, objectFit: "fill" }} />
        {renderSlide && activeVideo ? (
          <div className="powerpoint-export-drawing-layer">
            <DrawingPreviewCanvas drawings={activeVideo.drawings} playerTracks={activeVideo.playerTracks} currentTime={timelineTime} width={EXPORT_WIDTH} height={EXPORT_HEIGHT} getVideoElement={getVideoElement} registerCapture={registerOverlayCapture} />
          </div>
        ) : renderSlide ? <SlideRenderer slide={renderSlide} interactive={false} showCaption={false} presentationTime={renderSlide.content.kind === "tactical-board" ? renderPresentationTime : undefined} /> : null}
      </div>
    </>
  );
}
