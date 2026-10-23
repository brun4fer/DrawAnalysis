"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/VideoPlayer";
import { PropertiesPanel } from "@/components/properties/PropertiesPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { PresentationMode } from "@/components/presentation/PresentationMode";
import { SlideList } from "@/components/slides/SlideList";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { SlideTypePicker } from "@/components/slides/SlideTypePicker";
import { SlidePropertiesPanel } from "@/components/slides/SlidePropertiesPanel";
import { StaticSlideFooter } from "@/components/slides/StaticSlideFooter";
import { CloudLibraryModal, type CloudAssetSelection } from "@/components/cloud/CloudLibraryModal";
import { ProjectLibraryModal } from "@/components/projects/ProjectLibraryModal";
import { useEditorStore } from "@/store/useEditorStore";
import { TOOLS } from "@/components/tools/toolDefinitions";
import { createSlide } from "@/utils/slideFactory";
import { prepareSlidesForStorage } from "@/utils/presentationData";
import type { AnalysisSlide, SlideType } from "@/types/slide";
import { APP_PRODUCT } from "@/lib/product";
import { type CloudUploadStatus, type CloudVideoAsset, uploadCloudVideo } from "@/utils/cloudVideoUpload";

type Account = { user: { id: string; name: string; username: string }; workspace: { id: string; name: string } };
type AutomaticUpload = { fileName: string; status: CloudUploadStatus };

const VideoExport = dynamic(() => import("@/components/export/VideoExport").then((module) => module.VideoExport), { ssr: false });
const PdfExport = dynamic(() => import("@/components/export/PdfExport").then((module) => module.PdfExport), { ssr: false });

export function Editor() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const sourceUrlsRef = useRef<Set<string>>(new Set());
  const localFilesRef = useRef<Map<string, File>>(new Map());
  const automaticUploadPromisesRef = useRef<Map<string, { file: File; promise: Promise<CloudVideoAsset>; controller: AbortController }>>(new Map());
  const resolvingAssetsRef = useRef<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [videoExportOpen, setVideoExportOpen] = useState(false);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(APP_PRODUCT.defaultProjectName);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");
  const [automaticUploads, setAutomaticUploads] = useState<Record<string, AutomaticUpload>>({});
  const {
    selectedId, removeDrawing, undo, redo, setTool,
    drawings, slides, selectedSlideId, addSlide, updateSlide, replacePresentation, setVideoSource, setIsPlaying, setSelectedSlideId, loadFavorites,
  } = useEditorStore();
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const isVideoSlide = selectedSlide?.content.kind === "video";
  const source = selectedSlide?.content.kind === "video" ? selectedSlide.content.sourceUrl ?? null : null;
  const filename = selectedSlide?.content.kind === "video" ? selectedSlide.content.fileName : "";
  const activeAutomaticUpload = (selectedSlideId ? automaticUploads[selectedSlideId] : undefined) ?? Object.values(automaticUploads)[0];

  useEffect(() => {
    void fetch("/api/account").then(async (response) => {
      if (response.status === 401) { router.replace("/login"); return; }
      if (response.ok) {
        const result = await response.json() as Account;
        setAccount(result);
        loadFavorites(`${APP_PRODUCT.variant}:tool-favorites:${result.workspace.id}:${result.user.id}`);
      }
    });
  }, [loadFavorites, router]);

  useEffect(() => {
    const sourceUrls = sourceUrlsRef.current;
    return () => sourceUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const hasLocalVideo = slides.some((slide) => slide.content.kind === "video" && slide.content.fileName.trim() && !slide.content.mediaAssetId);
    if (!hasLocalVideo) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [slides]);

  useEffect(() => {
    for (const slide of slides) {
      if (slide.content.kind !== "video" || !slide.content.mediaAssetId || slide.content.sourceUrl || resolvingAssetsRef.current.has(slide.id)) continue;
      resolvingAssetsRef.current.add(slide.id);
      void fetch(`/api/media-library/${encodeURIComponent(slide.content.mediaAssetId)}/playback`)
        .then(async (response) => {
          const result = await response.json() as { url?: string; error?: string };
          if (!response.ok || !result.url) throw new Error(result.error || "Não foi possível abrir um vídeo cloud.");
          setVideoSource(slide.id, result.url);
        })
        .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Não foi possível abrir um vídeo cloud."))
        .finally(() => resolvingAssetsRef.current.delete(slide.id));
    }
  }, [slides, setVideoSource]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || presenting || pickerOpen || cloudOpen || projectsOpen || videoExportOpen || pdfExportOpen) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(); return; }
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (!isVideoSlide) return;
      if (event.code === "Space") { event.preventDefault(); playerRef.current?.toggle(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); playerRef.current?.seekBy(-1); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); playerRef.current?.seekBy(1); return; }
      if (event.key === ",") { event.preventDefault(); playerRef.current?.frameBy(-1); return; }
      if (event.key === ".") { event.preventDefault(); playerRef.current?.frameBy(1); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); removeDrawing(selectedId); return; }
      if (event.key === "Escape") { setTool("select"); return; }
      const matched = TOOLS.find((tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase());
      if (matched) setTool(matched.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function uploadSlideVideo(slideId: string, file: File) {
    const existing = automaticUploadPromisesRef.current.get(slideId);
    if (existing?.file === file) return existing.promise;
    if (existing) {
      existing.controller.abort();
      await existing.promise.catch(() => undefined);
    }
    const controller = new AbortController();
    const task = (async () => {
      try {
        const asset = await uploadCloudVideo(file, (status) => {
          setAutomaticUploads((current) => ({ ...current, [slideId]: { fileName: file.name, status } }));
        }, controller.signal);
        const before = useEditorStore.getState().slides;
        const origin = before.find((slide) => slide.id === slideId);
        if (!origin || origin.content.kind !== "video" || origin.content.fileName !== file.name || localFilesRef.current.get(slideId) !== file) return asset;
        const originUrl = origin?.content.kind === "video" ? origin.content.sourceUrl : undefined;
        useEditorStore.setState((state) => ({
          slides: state.slides.map((slide) => {
            if (slide.content.kind !== "video" || slide.content.mediaAssetId) return slide;
            const matches = slide.id === slideId || Boolean(originUrl && slide.content.sourceUrl === originUrl && slide.content.fileName === file.name);
            return matches
              ? { ...slide, content: { ...slide.content, mediaAssetId: asset.id, endTime: slide.content.endTime ?? asset.durationSeconds } }
              : slide;
          }),
        }));
        const savedSlides = useEditorStore.getState().slides;
        savedSlides.forEach((slide) => {
          if (slide.content.kind === "video" && slide.content.mediaAssetId === asset.id) localFilesRef.current.delete(slide.id);
        });
        setNotice(`Vídeo “${file.name}” guardado automaticamente na cloud.`);
        if (projectId) await persistProject(savedSlides);
        return asset;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
        const message = caught instanceof Error ? caught.message : "Não foi possível guardar o vídeo na cloud.";
        setNotice(`Falha ao guardar “${file.name}”: ${message}`);
        throw caught;
      } finally {
        if (automaticUploadPromisesRef.current.get(slideId)?.controller === controller) {
          automaticUploadPromisesRef.current.delete(slideId);
          setAutomaticUploads((current) => {
            const next = { ...current };
            delete next[slideId];
            return next;
          });
        }
      }
    })();
    automaticUploadPromisesRef.current.set(slideId, { file, promise: task, controller });
    return task;
  }

  async function ensureLocalVideosInCloud() {
    const currentSlides = useEditorStore.getState().slides;
    const uploads = currentSlides.flatMap((slide) => {
      if (slide.content.kind !== "video" || !slide.content.fileName.trim() || slide.content.mediaAssetId) return [];
      let file = localFilesRef.current.get(slide.id);
      let uploadSlideId = slide.id;
      if (!file && slide.content.sourceUrl) {
        const sourceUrl = slide.content.sourceUrl;
        const sourceSlideId = currentSlides.find((candidate) => candidate.content.kind === "video"
          && candidate.content.sourceUrl === sourceUrl
          && localFilesRef.current.has(candidate.id))?.id;
        if (sourceSlideId) {
          file = localFilesRef.current.get(sourceSlideId);
          uploadSlideId = sourceSlideId;
        }
      }
      return file ? [uploadSlideVideo(uploadSlideId, file)] : [];
    });
    if (uploads.length) await Promise.all(uploads);
    return useEditorStore.getState().slides;
  }

  const openFile = (file?: File) => {
    if (!file || !selectedSlide || selectedSlide.content.kind !== "video") return;
    const previousUrl = selectedSlide.content.sourceUrl;
    if (previousUrl?.startsWith("blob:") && sourceUrlsRef.current.delete(previousUrl)) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(file);
    sourceUrlsRef.current.add(url);
    localFilesRef.current.set(selectedSlide.id, file);
    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, fileName: file.name, mediaAssetId: undefined, sourceUrl: url, startTime: 0, endTime: undefined } });
    void uploadSlideVideo(selectedSlide.id, file).catch(() => undefined);
  };

  const selectCloudAsset = (asset: CloudAssetSelection) => {
    if (!selectedSlide || selectedSlide.content.kind !== "video") return;
    const previousUrl = selectedSlide.content.sourceUrl;
    const sameVideo = selectedSlide.content.fileName.trim() === asset.fileName.trim();
    const startTime = sameVideo ? Math.min(selectedSlide.content.startTime, asset.durationSeconds) : 0;
    const endTime = sameVideo && selectedSlide.content.endTime !== undefined
      ? Math.min(selectedSlide.content.endTime, asset.durationSeconds)
      : asset.durationSeconds;
    const content = { ...selectedSlide.content, fileName: asset.fileName, mediaAssetId: asset.id, sourceUrl: asset.url, startTime, endTime };
    const nextSlides = slides.map((slide) => slide.id === selectedSlide.id ? { ...slide, content } : slide);
    updateSlide(selectedSlide.id, { content });
    localFilesRef.current.delete(selectedSlide.id);
    if (previousUrl?.startsWith("blob:") && sourceUrlsRef.current.delete(previousUrl)) URL.revokeObjectURL(previousUrl);
    setCloudOpen(false);
    setNotice("Vídeo guardado e associado à apresentação.");
    if (projectId) void persistProject(nextSlides);
  };

  const addNewSlide = (type: SlideType) => {
    addSlide(createSlide(type, slides.length));
    setPickerOpen(false);
  };

  const captureAsImageSlide = () => {
    const imageDataUrl = playerRef.current?.captureFrame();
    if (!imageDataUrl || !selectedSlide || selectedSlide.content.kind !== "video") return;
    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, thumbnail: imageDataUrl } });
    const imageSlide = createSlide("image", slides.length);
    imageSlide.name = `Frame · ${selectedSlide.name}`;
    imageSlide.caption = selectedSlide.caption;
    imageSlide.captionOpacity = selectedSlide.captionOpacity;
    imageSlide.captionBackgroundColor = selectedSlide.captionBackgroundColor;
    imageSlide.captionTextColor = selectedSlide.captionTextColor;
    imageSlide.captionFontSize = selectedSlide.captionFontSize;
    imageSlide.captionHeight = selectedSlide.captionHeight;
    imageSlide.captionPositionY = selectedSlide.captionPositionY;
    if (imageSlide.content.kind === "image") imageSlide.content.imageDataUrl = imageDataUrl;
    addSlide(imageSlide);
  };

  async function persistProject(projectSlides: AnalysisSlide[]) {
    if (!projectId) return;
    setSaveState("saving");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: projectName, data: { slides: prepareSlidesForStorage(projectSlides, { selectedSlideId, drawings }) } }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível guardar a apresentação.");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (caught) {
      setSaveState("error");
      setNotice(caught instanceof Error ? caught.message : "Não foi possível guardar a apresentação.");
    }
  }

  async function saveProject() {
    if (!projectId) { setProjectsOpen(true); return; }
    let preparedSlides: AnalysisSlide[];
    try {
      preparedSlides = await ensureLocalVideosInCloud();
    } catch {
      return;
    }
    const localVideo = preparedSlides.find((slide) => slide.content.kind === "video" && slide.content.fileName.trim() && !slide.content.mediaAssetId);
    if (localVideo && !window.confirm("Esta apresentação contém pelo menos um vídeo apenas local. Os desenhos serão guardados, mas esse vídeo não poderá ser reaberto.\n\nOK: guardar sem o vídeo\nCancelar: abrir a biblioteca cloud")) {
      setSelectedSlideId(localVideo.id);
      setCloudOpen(true);
      return;
    }
    await persistProject(preparedSlides);
  }

  async function logout() {
    const localVideo = slides.find((slide) => slide.content.kind === "video" && slide.content.fileName.trim() && !slide.content.mediaAssetId);
    if (localVideo && !window.confirm("Existe um vídeo apenas local nesta apresentação. Se terminar a sessão agora, terá de o selecionar novamente.\n\nOK: terminar sessão\nCancelar: guardar o vídeo na cloud")) {
      setSelectedSlideId(localVideo.id);
      setCloudOpen(true);
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const openStoredProject = (project: { id: string; name: string; slides: AnalysisSlide[] }) => {
    const localVideo = slides.find((slide) => slide.content.kind === "video" && slide.content.fileName.trim() && !slide.content.mediaAssetId);
    if (localVideo && !window.confirm("Existe um vídeo apenas local na apresentação atual. Se abrir outro projeto agora, terá de o selecionar novamente.\n\nOK: abrir o outro projeto\nCancelar: guardar o vídeo na cloud")) {
      setSelectedSlideId(localVideo.id);
      setCloudOpen(true);
      return;
    }
    sourceUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    sourceUrlsRef.current.clear();
    localFilesRef.current.clear();
    setProjectId(project.id);
    setProjectName(project.name);
    replacePresentation(project.slides);
    setSaveState("idle");
  };

  const openVideoExport = useCallback(() => {
    setIsPlaying(false);
    setVideoExportOpen(true);
  }, [setIsPlaying]);
  const closeVideoExport = useCallback(() => setVideoExportOpen(false), []);
  const openPdfExport = useCallback(() => {
    setIsPlaying(false);
    setPdfExportOpen(true);
  }, [setIsPlaying]);
  const closePdfExport = useCallback(() => setPdfExportOpen(false), []);

  const openPreview = useCallback(() => {
    setPresenting(true);
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  const closePreview = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  return (
    <main className="app-shell presentation-builder">
      <input ref={inputRef} className="sr-only" type="file" accept="video/*" onChange={(event) => { openFile(event.target.files?.[0]); event.target.value = ""; }} />
      <TopBar filename={filename} isVideoSlide={isVideoSlide} onOpen={() => inputRef.current?.click()} onPreview={openPreview} onCapture={captureAsImageSlide} onCloud={() => setCloudOpen(true)} onProjects={() => setProjectsOpen(true)} onSave={() => void saveProject()} onExportVideo={openVideoExport} onExportPdf={openPdfExport} onLogout={() => void logout()} projectName={projectName} saveState={saveState} account={account} />
      {notice && <button className="editor-notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
      {activeAutomaticUpload && (
        <div className="automatic-cloud-upload" role="status">
          <span><b>A guardar vídeo na cloud</b><small>{activeAutomaticUpload.fileName} · {activeAutomaticUpload.status.detail}</small></span>
          <div><i style={{ width: `${Math.round(activeAutomaticUpload.status.progress * 100)}%` }} /></div>
          <strong>{Math.round(activeAutomaticUpload.status.progress * 100)}%</strong>
        </div>
      )}
      <div className="presentation-workspace">
        <SlideList onAdd={() => setPickerOpen(true)} />
        {selectedSlide ? (
          selectedSlide.content.kind === "video" ? (
            <div className="editor-grid video-slide-editor">
              <ToolRail />
              <VideoPlayer
                ref={playerRef}
                source={source}
                clipStart={selectedSlide.content.startTime}
                clipEnd={selectedSlide.content.endTime}
                freezeFrames={selectedSlide.content.freezeFrames}
                caption={selectedSlide.caption}
                captionOpacity={selectedSlide.captionOpacity}
                captionBackgroundColor={selectedSlide.captionBackgroundColor}
                captionTextColor={selectedSlide.captionTextColor}
                captionFontSize={selectedSlide.captionFontSize}
                captionHeight={selectedSlide.captionHeight}
                captionPositionY={selectedSlide.captionPositionY}
                onChooseVideo={() => inputRef.current?.click()}
                onDurationReady={(videoDuration) => {
                  if (selectedSlide.content.kind === "video" && selectedSlide.content.endTime === undefined) updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, endTime: videoDuration } });
                }}
              />
              <PropertiesPanel />
            </div>
          ) : (
            <div className="static-editor-grid">
              <SlideRenderer slide={selectedSlide} onContentChange={(content) => updateSlide(selectedSlide.id, { content })} />
              <SlidePropertiesPanel />
            </div>
          )
        ) : <div className="no-slide-workspace"><button onClick={() => setPickerOpen(true)}>+ Add Slide</button><span>Crie o primeiro slide da apresentação.</span></div>}
      </div>
      {isVideoSlide ? <Timeline /> : <StaticSlideFooter />}
      {pickerOpen && <SlideTypePicker onSelect={addNewSlide} onClose={() => setPickerOpen(false)} />}
      {cloudOpen && <CloudLibraryModal localFile={selectedSlide ? localFilesRef.current.get(selectedSlide.id) : null} backgroundUpload={selectedSlide ? automaticUploads[selectedSlide.id] : undefined} onSelect={selectCloudAsset} onClose={() => setCloudOpen(false)} />}
      {projectsOpen && <ProjectLibraryModal slides={slides} selectedSlideId={selectedSlideId} activeDrawings={drawings} onPrepareForSave={ensureLocalVideosInCloud} onClose={() => setProjectsOpen(false)} onResolveMissingVideo={(slideId) => { setProjectsOpen(false); setSelectedSlideId(slideId); setCloudOpen(true); }} onOpen={openStoredProject} />}
      {presenting && <PresentationMode onClose={closePreview} />}
      {videoExportOpen && <VideoExport slides={slides} selectedSlideId={selectedSlideId} projectName={projectName} onClose={closeVideoExport} />}
      {pdfExportOpen && <PdfExport slides={slides} projectName={projectName} onClose={closePdfExport} />}
    </main>
  );
}
