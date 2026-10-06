"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileVideo2, LoaderCircle, X, XCircle } from "lucide-react";
import { DrawingPreviewCanvas } from "@/components/canvas/DrawingPreviewCanvas";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import type { AnalysisSlide, VideoSlideContent } from "@/types/slide";
import { orderedFreezeFrames, sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";

interface Props {
  slides: AnalysisSlide[];
  projectName: string;
  onClose: () => void;
}

interface RenderedVideo {
  url: string;
  extension: "mp4" | "webm";
  cover: string;
}

const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 720;
const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "apresentacao";
}

function selectRecordingFormat() {
  if (typeof MediaRecorder === "undefined") throw new Error("Este browser não permite gravar o vídeo para o PowerPoint.");
  const formats = [
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" as const },
    { mime: "video/mp4", extension: "mp4" as const },
    { mime: "video/webm;codecs=vp9,opus", extension: "webm" as const },
    { mime: "video/webm;codecs=vp8,opus", extension: "webm" as const },
    { mime: "video/webm", extension: "webm" as const },
  ];
  const selected = formats.find((format) => MediaRecorder.isTypeSupported(format.mime));
  if (!selected) throw new Error("Não foi encontrado um formato de vídeo compatível neste browser.");
  return selected;
}

function waitForVideo(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("O vídeo demorou demasiado tempo a abrir.")), 20000);
    const loaded = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", loaded);
      reject(new Error("Não foi possível abrir o vídeo deste slide."));
    };
    video.addEventListener("loadedmetadata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

function seekVideo(video: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(video.duration || time, time));
  if (Math.abs(video.currentTime - target) < .018) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1500);
    video.addEventListener("seeked", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    video.currentTime = target;
  });
}

export function PowerPointExport({ slides, projectName, onClose }: Props) {
  const [renderSlide, setRenderSlide] = useState<AnalysisSlide | null>(null);
  const [timelineTime, setTimelineTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("A preparar a apresentação…");
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState("");
  const captureRootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCaptureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const cancelledRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaUrlsRef = useRef<string[]>([]);
  const slidesRef = useRef(slides);

  const registerOverlayCapture = useCallback((capture: (() => HTMLCanvasElement | null) | null) => {
    overlayCaptureRef.current = capture;
  }, []);

  const cancel = () => {
    cancelledRef.current = true;
    setMessage("A cancelar a exportação…");
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    videoRef.current?.pause();
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    mediaUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    let disposed = false;
    const exportSlides = slidesRef.current;

    const ensureActive = () => {
      if (disposed || cancelledRef.current) throw new DOMException("Exportação cancelada.", "AbortError");
    };

    const showSlide = async (slide: AnalysisSlide) => {
      ensureActive();
      setRenderSlide(slide);
      await nextPaint();
      await document.fonts.ready;
      await nextPaint();
      ensureActive();
    };

    const drawVideoFrame = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível criar o fotograma de exportação.");
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const overlay = overlayCaptureRef.current?.();
      if (overlay) context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    };

    const renderVideo = async (content: VideoSlideContent, slideIndex: number): Promise<RenderedVideo> => {
      const video = videoRef.current;
      if (!video || !content.sourceUrl) throw new Error(`O slide ${slideIndex + 1} não tem o vídeo disponível neste dispositivo.`);
      video.load();
      await waitForVideo(video);
      ensureActive();

      const sourceEnd = Math.max(content.startTime, Math.min(content.endTime ?? video.duration, video.duration));
      const freezes = orderedFreezeFrames(content.freezeFrames).filter((freeze) => freeze.sourceTime >= content.startTime && freeze.sourceTime <= sourceEnd);
      const timelineStart = sourceTimeToTimeline(content.startTime, freezes);
      const timelineEnd = sourceTimeToTimeline(sourceEnd, freezes);
      const exportDuration = Math.max(.05, timelineEnd - timelineStart);
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;

      await seekVideo(video, content.startTime);
      setTimelineTime(timelineStart);
      await nextPaint();
      drawVideoFrame(canvas, video);
      let cover: string;
      try {
        cover = canvas.toDataURL("image/jpeg", .9);
      } catch {
        throw new Error(`O vídeo do slide ${slideIndex + 1} não permite captura. Confirme as permissões CORS da origem cloud.`);
      }

      const format = selectRecordingFormat();
      const outputStream = canvas.captureStream(30);
      video.volume = 0;
      video.muted = false;
      try {
        await video.play();
      } catch {
        video.muted = true;
        await video.play();
      }
      await nextPaint();

      const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
      const sourceStream = captureVideo.captureStream?.() ?? captureVideo.mozCaptureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => outputStream.addTrack(track));
      video.pause();
      await seekVideo(video, content.startTime);

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(outputStream, { mimeType: format.mime, videoBitsPerSecond: 5_500_000 });
      recorderRef.current = recorder;
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
        recorder.addEventListener("error", () => reject(new Error("O browser interrompeu a gravação do vídeo.")), { once: true });
        recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: format.mime })), { once: true });
      });
      recorder.start(1000);
      await video.play();
      const startedAt = performance.now();
      let recordingError: unknown;

      try {
        while (true) {
          ensureActive();
          const elapsed = Math.min(exportDuration, (performance.now() - startedAt) / 1000);
          const currentTimeline = timelineStart + elapsed;
          const point = timelineTimeToSource(currentTimeline, freezes);

          if (point.freeze) {
            if (!video.paused) video.pause();
            if (Math.abs(video.currentTime - point.sourceTime) > .025) await seekVideo(video, point.sourceTime);
          } else {
            if (Math.abs(video.currentTime - point.sourceTime) > .18) video.currentTime = point.sourceTime;
            if (video.paused && elapsed < exportDuration) await video.play();
          }

          setTimelineTime(currentTimeline);
          await nextPaint();
          drawVideoFrame(canvas, video);
          const slideProgress = elapsed / exportDuration;
          setProgress(Math.round(((slideIndex + slideProgress) / Math.max(1, exportSlides.length)) * 100));
          setMessage(`A renderizar vídeo ${slideIndex + 1}/${exportSlides.length} · ${Math.round(slideProgress * 100)}%`);
          if (elapsed >= exportDuration) break;
        }
      } catch (caught) {
        recordingError = caught;
      } finally {
        video.pause();
        if (recorder.state !== "inactive") recorder.stop();
      }

      const blob = await stopped;
      recorderRef.current = null;
      sourceStream?.getTracks().forEach((track) => track.stop());
      outputStream.getTracks().forEach((track) => track.stop());
      if (recordingError) throw recordingError;
      const url = URL.createObjectURL(blob);
      mediaUrlsRef.current.push(url);
      return { url, extension: format.extension, cover };
    };

    const run = async () => {
      try {
        const [{ default: PptxGenJS }, { toPng }] = await Promise.all([import("pptxgenjs"), import("html-to-image")]);
        ensureActive();
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";
        pptx.author = "TactiDraw";
        pptx.company = "TactiDraw";
        pptx.subject = "Apresentação de análise de futebol";
        pptx.title = projectName;
        pptx.theme = {
          headFontFace: "Aptos Display",
          bodyFontFace: "Aptos",
        };

        for (let index = 0; index < exportSlides.length; index += 1) {
          const analysisSlide = exportSlides[index];
          setProgress(Math.round((index / Math.max(1, exportSlides.length)) * 100));
          setMessage(`A preparar slide ${index + 1}/${exportSlides.length}…`);
          await showSlide(analysisSlide);
          const pptSlide = pptx.addSlide();
          pptSlide.background = { color: "080A0B" };

          if (analysisSlide.content.kind === "video") {
            const media = await renderVideo(analysisSlide.content, index);
            pptSlide.addMedia({
              type: "video",
              path: media.url,
              extn: media.extension,
              cover: media.cover,
              x: 0,
              y: 0,
              w: SLIDE_WIDTH,
              h: SLIDE_HEIGHT,
              objectName: analysisSlide.name,
            });
          } else {
            const root = captureRootRef.current;
            if (!root) throw new Error(`Não foi possível renderizar o slide ${index + 1}.`);
            const image = await toPng(root, {
              width: EXPORT_WIDTH,
              height: EXPORT_HEIGHT,
              canvasWidth: EXPORT_WIDTH,
              canvasHeight: EXPORT_HEIGHT,
              pixelRatio: 1,
              cacheBust: true,
              backgroundColor: "#080a0b",
            });
            pptSlide.addImage({ data: image, x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT });
          }

          if (analysisSlide.caption.trim()) {
            pptSlide.addText(analysisSlide.caption, {
              x: 0,
              y: 6.78,
              w: SLIDE_WIDTH,
              h: .72,
              margin: .12,
              fontFace: "Aptos",
              fontSize: 18,
              bold: true,
              color: "111111",
              align: "center",
              valign: "middle",
              breakLine: false,
              fill: { color: "FFFFFF", transparency: 0 },
              line: { color: "FFFFFF", transparency: 100 },
            });
          }
          pptSlide.addNotes(`Slide TactiDraw · duração configurada: ${analysisSlide.duration}s`);
        }

        ensureActive();
        setProgress(99);
        setMessage("A construir o ficheiro PowerPoint…");
        await pptx.writeFile({ fileName: `${safeFileName(projectName)}.pptx`, compression: true });
        ensureActive();
        setProgress(100);
        setMessage("PowerPoint exportado com sucesso.");
        setState("done");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          if (!disposed) onClose();
          return;
        }
        if (!disposed) {
          setState("error");
          setError(caught instanceof Error ? caught.message : "Não foi possível exportar o PowerPoint.");
          setMessage("A exportação não foi concluída.");
        }
      } finally {
        mediaUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        mediaUrlsRef.current = [];
      }
    };

    void run();
    return () => { disposed = true; };
  }, [onClose, projectName]);

  const activeVideo = renderSlide?.content.kind === "video" ? renderSlide.content : null;
  const getVideoElement = useCallback(() => videoRef.current, []);

  return (
    <>
      <div className="modal-backdrop powerpoint-export-backdrop">
        <section className="powerpoint-export-dialog" role="dialog" aria-modal="true" aria-labelledby="powerpoint-export-title">
          <header>
            <div className={`powerpoint-export-icon state-${state}`}>
              {state === "working" ? <LoaderCircle size={23} /> : state === "done" ? <CheckCircle2 size={23} /> : <XCircle size={23} />}
            </div>
            <div><span>EXPORTAR APRESENTAÇÃO</span><h2 id="powerpoint-export-title">PowerPoint com vídeo</h2></div>
            {state !== "working" && <button onClick={onClose} title="Fechar"><X size={18} /></button>}
          </header>
          <div className="powerpoint-export-body">
            <FileVideo2 size={32} />
            <strong>{message}</strong>
            <p>{state === "working" ? "Os vídeos são renderizados com cortes, pausas e desenhos antes de serem incorporados. Pode demorar aproximadamente a duração total das jogadas." : state === "done" ? "O ficheiro .pptx foi descarregado e os vídeos podem ser reproduzidos diretamente no PowerPoint." : error}</p>
            <div className="powerpoint-export-progress"><i style={{ width: `${progress}%` }} /></div>
            <small>{progress}%</small>
          </div>
          <footer>
            {state === "working"
              ? <button className="secondary" onClick={cancel}>Cancelar</button>
              : <button className="primary" onClick={onClose}>Fechar</button>}
          </footer>
        </section>
      </div>

      <div ref={captureRootRef} className="powerpoint-export-capture" aria-hidden="true">
        {renderSlide && activeVideo ? (
          <div className="powerpoint-export-video-frame">
            <video ref={videoRef} src={activeVideo.sourceUrl} crossOrigin="anonymous" playsInline preload="auto" />
            <div className="powerpoint-export-drawing-layer">
              <DrawingPreviewCanvas
                drawings={activeVideo.drawings}
                playerTracks={activeVideo.playerTracks}
                currentTime={timelineTime}
                width={EXPORT_WIDTH}
                height={EXPORT_HEIGHT}
                getVideoElement={getVideoElement}
                registerCapture={registerOverlayCapture}
              />
            </div>
          </div>
        ) : renderSlide ? <SlideRenderer slide={renderSlide} interactive={false} /> : null}
      </div>
    </>
  );
}
