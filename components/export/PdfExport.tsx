"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Image as ImageIcon, LoaderCircle, X, XCircle } from "lucide-react";
import { DrawingPreviewCanvas } from "@/components/canvas/DrawingPreviewCanvas";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { APP_PRODUCT } from "@/lib/product";
import type { AnalysisSlide, VideoSlideContent } from "@/types/slide";
import { hexToRgba } from "@/utils/color";
import { slideBackgroundVideoUrl } from "@/utils/slideMedia";
import { freezeFramesInsideClip, sourceTimeToTimeline } from "@/utils/videoTimeline";

interface Props {
  slides: AnalysisSlide[];
  projectName: string;
  onClose: () => void;
}

interface FramePickerProps {
  slide: AnalysisSlide;
  source: string;
  value?: number;
  onChange: (value: number) => void;
}

const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 720;

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "apresentacao";
}

function describeError(value: unknown) {
  if (value instanceof DOMException) return `${value.name}: ${value.message}`;
  if (value instanceof Error) return value.message || value.name;
  if (value instanceof Event) return `Evento ${value.type || "desconhecido"}`;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
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
      reject(new Error("Não foi possível abrir um dos vídeos."));
    };
    video.addEventListener("loadeddata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

async function prepareVideoSource(video: HTMLVideoElement, source: string, slideNumber: number) {
  video.pause();
  if (video.getAttribute("src") !== source) {
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
}

function seekVideo(video: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(video.duration || time, time));
  if (Math.abs(video.currentTime - target) < .018) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1800);
    video.addEventListener("seeked", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    video.currentTime = target;
  });
}

function backgroundLayout(slide: AnalysisSlide) {
  if (slide.content.kind === "kickoff") return {
    fit: slide.content.backgroundFit ?? "cover" as const,
    positionX: slide.content.backgroundPositionX ?? .5,
    positionY: slide.content.backgroundPositionY ?? .5,
  };
  return { fit: "cover" as const, positionX: .5, positionY: .5 };
}

function drawVideoBackground(context: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number, slide: AnalysisSlide) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const layout = backgroundLayout(slide);
  const scale = layout.fit === "contain"
    ? Math.min(width / sourceWidth, height / sourceHeight)
    : Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(video, (width - drawWidth) * layout.positionX, (height - drawHeight) * layout.positionY, drawWidth, drawHeight);
}

function frameSource(slide: AnalysisSlide) {
  if (slide.content.kind === "video") return slide.content.sourceUrl;
  return slideBackgroundVideoUrl(slide);
}

function clipBounds(slide: AnalysisSlide, duration: number) {
  if (slide.content.kind !== "video") return { min: 0, max: Math.max(0, duration) };
  const min = Math.max(0, Math.min(duration, slide.content.startTime));
  const max = Math.max(min, Math.min(duration, slide.content.endTime ?? duration));
  return { min, max };
}

function VideoFramePicker({ slide, source, value, onChange }: FramePickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [bounds, setBounds] = useState({ min: 0, max: 0 });
  const [error, setError] = useState("");
  const layout = backgroundLayout(slide);

  const setFrame = useCallback((time: number) => {
    const selected = Math.max(bounds.min, Math.min(bounds.max, time));
    onChange(selected);
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration)) video.currentTime = selected;
  }, [bounds.max, bounds.min, onChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || value === undefined || !Number.isFinite(video.duration)) return;
    if (Math.abs(video.currentTime - value) > .018) video.currentTime = value;
  }, [value]);

  return (
    <article className="pdf-frame-picker">
      <video
        ref={videoRef}
        src={source}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="metadata"
        style={{ objectFit: slide.content.kind === "video" ? "fill" : layout.fit, objectPosition: `${layout.positionX * 100}% ${layout.positionY * 100}%` }}
        onLoadedMetadata={(event) => {
          const nextBounds = clipBounds(slide, event.currentTarget.duration);
          setBounds(nextBounds);
          const initial = value === undefined
            ? nextBounds.min + (nextBounds.max - nextBounds.min) / 2
            : Math.max(nextBounds.min, Math.min(nextBounds.max, value));
          onChange(initial);
          event.currentTarget.currentTime = initial;
          setError("");
        }}
        onError={() => setError("Não foi possível mostrar este vídeo.")}
      />
      <div className="pdf-frame-picker-copy">
        <span>SLIDE DE VÍDEO</span>
        <strong>{slide.name}</strong>
        <small>Arraste a linha até à imagem que quer colocar no PDF.</small>
      </div>
      {error ? <p className="pdf-frame-error">{error}</p> : (
        <div className="pdf-frame-range">
          <code>{formatTime(bounds.min)}</code>
          <input
            aria-label={`Escolher fotograma de ${slide.name}`}
            type="range"
            min={bounds.min}
            max={Math.max(bounds.min, bounds.max)}
            step={.04}
            value={value ?? bounds.min}
            disabled={bounds.max <= bounds.min}
            onChange={(event) => setFrame(Number(event.target.value))}
          />
          <code>{formatTime(bounds.max)}</code>
          <b>Imagem escolhida: {formatTime(value ?? bounds.min)}</b>
        </div>
      )}
    </article>
  );
}

export function PdfExport({ slides, projectName, onClose }: Props) {
  const videoSlides = useMemo(() => slides.flatMap((slide) => {
    const source = frameSource(slide);
    return slide.content.kind === "video" || source ? [{ slide, source }] : [];
  }), [slides]);
  const [frameTimes, setFrameTimes] = useState<Record<string, number | undefined>>({});
  const [phase, setPhase] = useState<"config" | "working" | "done" | "error">("config");
  const [renderSlide, setRenderSlide] = useState<AnalysisSlide | null>(null);
  const [timelineTime, setTimelineTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Escolha as imagens dos vídeos.");
  const [error, setError] = useState("");
  const captureRootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCaptureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const cancelledRef = useRef(false);

  const registerOverlayCapture = useCallback((capture: (() => HTMLCanvasElement | null) | null) => {
    overlayCaptureRef.current = capture;
  }, []);

  const cancel = () => {
    cancelledRef.current = true;
    videoRef.current?.pause();
    onClose();
  };

  useEffect(() => () => {
    cancelledRef.current = true;
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    if (phase !== "working") return;
    let disposed = false;

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

    const run = async () => {
      try {
        if (!slides.length) throw new Error("Não existem slides para exportar.");
        const [{ jsPDF }, { toCanvas }] = await Promise.all([import("jspdf"), import("html-to-image")]);
        ensureActive();
        const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [EXPORT_WIDTH, EXPORT_HEIGHT], compress: true, hotfixes: ["px_scaling"] });

        for (let index = 0; index < slides.length; index += 1) {
          const slide = slides[index];
          setMessage(`A preparar slide ${index + 1}/${slides.length}…`);
          setProgress(Math.round(index / slides.length * 100));
          await showSlide(slide);

          const canvas = document.createElement("canvas");
          canvas.width = EXPORT_WIDTH;
          canvas.height = EXPORT_HEIGHT;
          const context = canvas.getContext("2d");
          if (!context) throw new Error(`Não foi possível compor o slide ${index + 1}.`);
          context.fillStyle = "#080a0b";
          context.fillRect(0, 0, canvas.width, canvas.height);

          if (slide.content.kind === "video") {
            const content: VideoSlideContent = slide.content;
            const video = videoRef.current;
            if (!video || !content.sourceUrl) throw new Error(`O slide ${index + 1} não tem o vídeo disponível neste dispositivo.`);
            await prepareVideoSource(video, content.sourceUrl, index + 1);
            const sourceEnd = Math.max(content.startTime, Math.min(content.endTime ?? video.duration, video.duration));
            const selectedTime = Math.max(content.startTime, Math.min(sourceEnd, frameTimes[slide.id] ?? content.startTime));
            const freezes = freezeFramesInsideClip(content, sourceEnd);
            await seekVideo(video, selectedTime);
            setTimelineTime(sourceTimeToTimeline(selectedTime, freezes));
            await nextPaint();
            context.drawImage(video, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
            const overlay = overlayCaptureRef.current?.();
            if (overlay) context.drawImage(overlay, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
            drawCaption(context, slide);
          } else {
            const backgroundVideo = slideBackgroundVideoUrl(slide);
            if (backgroundVideo) {
              const video = videoRef.current;
              const root = captureRootRef.current?.querySelector<HTMLElement>("[data-slide-root]");
              if (!video || !root) throw new Error(`Não foi possível compor o fundo do slide ${index + 1}.`);
              await prepareVideoSource(video, backgroundVideo, index + 1);
              const selectedTime = Math.max(0, Math.min(video.duration, frameTimes[slide.id] ?? 0));
              await seekVideo(video, selectedTime);
              const overlay = await toCanvas(root, {
                width: EXPORT_WIDTH,
                height: EXPORT_HEIGHT,
                canvasWidth: EXPORT_WIDTH,
                canvasHeight: EXPORT_HEIGHT,
                pixelRatio: 1,
                cacheBust: true,
                backgroundColor: "transparent",
                filter: (node) => !(node instanceof HTMLVideoElement)
                  && !(node instanceof HTMLElement && node.hasAttribute("data-slide-background-media")),
              });
              drawVideoBackground(context, video, EXPORT_WIDTH, EXPORT_HEIGHT, slide);
              context.drawImage(overlay, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
              drawCaption(context, slide);
            } else {
              const root = captureRootRef.current?.querySelector<HTMLElement>(".slide-stage-shell");
              if (!root) throw new Error(`Não foi possível renderizar o slide ${index + 1}.`);
              const rendered = await toCanvas(root, {
                width: EXPORT_WIDTH,
                height: EXPORT_HEIGHT,
                canvasWidth: EXPORT_WIDTH,
                canvasHeight: EXPORT_HEIGHT,
                pixelRatio: 1,
                cacheBust: true,
                backgroundColor: "#080a0b",
                filter: (node) => !(node instanceof HTMLVideoElement),
              });
              context.drawImage(rendered, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
              drawCaption(context, slide);
            }
          }

          ensureActive();
          let image: string;
          try {
            image = canvas.toDataURL("image/jpeg", .92);
          } catch {
            throw new Error(`O slide ${index + 1} contém media que não permite captura. Confirme as permissões da origem cloud.`);
          }
          if (index > 0) pdf.addPage([EXPORT_WIDTH, EXPORT_HEIGHT], "landscape");
          pdf.addImage(image, "JPEG", 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT, undefined, "FAST");
          setProgress(Math.round((index + 1) / slides.length * 100));
        }

        ensureActive();
        setMessage("A finalizar o PDF…");
        pdf.setProperties({ title: projectName, subject: "Apresentação de análise de futebol", author: APP_PRODUCT.name, creator: APP_PRODUCT.name });
        pdf.save(`${safeFileName(projectName)}.pdf`);
        setProgress(100);
        setMessage("PDF exportado com sucesso.");
        setPhase("done");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (!disposed) {
          console.error(`Falha na exportação PDF ${APP_PRODUCT.name}`, caught);
          setError(describeError(caught) || "Não foi possível exportar o PDF.");
          setMessage("A exportação não foi concluída.");
          setPhase("error");
        }
      }
    };

    void run();
    return () => { disposed = true; };
  }, [frameTimes, phase, projectName, slides]);

  const activeVideo = renderSlide?.content.kind === "video" ? renderSlide.content : null;
  const getVideoElement = useCallback(() => videoRef.current, []);
  const unavailableVideo = videoSlides.some(({ source }) => !source);
  const framesReady = videoSlides.every(({ slide, source }) => Boolean(source) && frameTimes[slide.id] !== undefined);
  const stateClass = phase === "config" ? "done" : phase;

  return (
    <>
      <div className="modal-backdrop powerpoint-export-backdrop">
        <section className="powerpoint-export-dialog pdf-export-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title">
          <header>
            <div className={`powerpoint-export-icon state-${stateClass}`}>
              {phase === "working" ? <LoaderCircle size={23} /> : phase === "done" ? <CheckCircle2 size={23} /> : phase === "error" ? <XCircle size={23} /> : <FileText size={23} />}
            </div>
            <div><span>EXPORTAR APRESENTAÇÃO</span><h2 id="pdf-export-title">Documento PDF</h2></div>
            {phase !== "working" && <button onClick={onClose} title="Fechar"><X size={18} /></button>}
          </header>
          {phase === "config" ? (
            <div className="pdf-export-config">
              {videoSlides.length ? (
                <>
                  <div className="pdf-export-intro"><ImageIcon size={19} /><p>O PDF não reproduz vídeo. Escolha abaixo o fotograma que representará cada slide com vídeo.</p></div>
                  <div className="pdf-frame-list">
                    {videoSlides.map(({ slide, source }) => source ? (
                      <VideoFramePicker key={slide.id} slide={slide} source={source} value={frameTimes[slide.id]} onChange={(value) => setFrameTimes((current) => ({ ...current, [slide.id]: value }))} />
                    ) : (
                      <article key={slide.id} className="pdf-frame-picker missing"><div className="pdf-missing-video"><FileText size={24} /></div><div className="pdf-frame-picker-copy"><span>VÍDEO INDISPONÍVEL</span><strong>{slide.name}</strong><small>Abra novamente o vídeo deste slide antes de exportar o PDF.</small></div></article>
                    ))}
                  </div>
                </>
              ) : <div className="pdf-export-empty"><FileText size={28} /><strong>A apresentação não tem vídeos.</strong><p>Todos os slides serão exportados diretamente como páginas do PDF.</p></div>}
            </div>
          ) : (
            <div className="powerpoint-export-body">
              <FileText size={32} />
              <strong>{message}</strong>
              <p>{phase === "working" ? "Cada slide está a ser convertido numa página de alta qualidade." : phase === "done" ? "O ficheiro .pdf foi descarregado." : error}</p>
              <div className="powerpoint-export-progress"><i style={{ width: `${progress}%` }} /></div>
              <small>{progress}%</small>
            </div>
          )}
          <footer>
            {phase === "config" && <><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={unavailableVideo || !framesReady} onClick={() => { cancelledRef.current = false; setPhase("working"); setProgress(0); setMessage("A preparar o PDF…"); }}>Exportar PDF</button></>}
            {phase === "working" && <button className="secondary" onClick={cancel}>Cancelar</button>}
            {(phase === "done" || phase === "error") && <button className="primary" onClick={onClose}>Fechar</button>}
          </footer>
        </section>
      </div>

      <div ref={captureRootRef} className="powerpoint-export-capture" aria-hidden="true">
        <video ref={videoRef} crossOrigin="anonymous" muted playsInline preload="auto" style={{ display: activeVideo ? "block" : "none", width: EXPORT_WIDTH, height: EXPORT_HEIGHT, objectFit: "fill" }} />
        {renderSlide && activeVideo ? (
          <div className="powerpoint-export-drawing-layer">
            <DrawingPreviewCanvas drawings={activeVideo.drawings} playerTracks={activeVideo.playerTracks} currentTime={timelineTime} width={EXPORT_WIDTH} height={EXPORT_HEIGHT} getVideoElement={getVideoElement} registerCapture={registerOverlayCapture} />
          </div>
        ) : renderSlide ? <SlideRenderer slide={renderSlide} interactive={false} showCaption={false} presentationTime={renderSlide.content.kind === "tactical-board" ? 0 : undefined} /> : null}
      </div>
    </>
  );
}
