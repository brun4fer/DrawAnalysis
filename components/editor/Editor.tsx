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
import type { SlideType } from "@/types/slide";

type Account = { user: { id: string; name: string; username: string }; workspace: { id: string; name: string } };

const VideoExport = dynamic(() => import("@/components/export/VideoExport").then((module) => module.VideoExport), { ssr: false });

export function Editor() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const sourceUrlsRef = useRef<Set<string>>(new Set());
  const resolvingAssetsRef = useRef<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [videoExportOpen, setVideoExportOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Apresentação sem título");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");
  const {
    selectedId, removeDrawing, undo, redo, setTool,
    drawings, slides, selectedSlideId, addSlide, updateSlide, replacePresentation, setVideoSource, setIsPlaying, loadFavorites,
  } = useEditorStore();
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const isVideoSlide = selectedSlide?.content.kind === "video";
  const source = selectedSlide?.content.kind === "video" ? selectedSlide.content.sourceUrl ?? null : null;
  const filename = selectedSlide?.content.kind === "video" ? selectedSlide.content.fileName : "";

  useEffect(() => {
    void fetch("/api/account").then(async (response) => {
      if (response.status === 401) { router.replace("/login"); return; }
      if (response.ok) {
        const result = await response.json() as Account;
        setAccount(result);
        loadFavorites(`tactidraw:tool-favorites:${result.workspace.id}:${result.user.id}`);
      }
    });
  }, [loadFavorites, router]);

  useEffect(() => {
    const sourceUrls = sourceUrlsRef.current;
    return () => sourceUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

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
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || presenting || pickerOpen || cloudOpen || projectsOpen) return;
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

  const openFile = (file?: File) => {
    if (!file || !selectedSlide || selectedSlide.content.kind !== "video") return;
    const url = URL.createObjectURL(file);
    sourceUrlsRef.current.add(url);
    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, fileName: file.name, mediaAssetId: undefined, sourceUrl: url, startTime: 0, endTime: undefined } });
  };

  const selectCloudAsset = (asset: CloudAssetSelection) => {
    if (!selectedSlide || selectedSlide.content.kind !== "video") return;
    updateSlide(selectedSlide.id, { content: { ...selectedSlide.content, fileName: asset.fileName, mediaAssetId: asset.id, sourceUrl: asset.url, startTime: 0, endTime: asset.durationSeconds } });
    setCloudOpen(false);
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
    if (imageSlide.content.kind === "image") imageSlide.content.imageDataUrl = imageDataUrl;
    addSlide(imageSlide);
  };

  async function saveProject() {
    if (!projectId) { setProjectsOpen(true); return; }
    setSaveState("saving");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: projectName, data: { slides: prepareSlidesForStorage(slides, { selectedSlideId, drawings }) } }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível guardar a apresentação.");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (caught) {
      setSaveState("error");
      setNotice(caught instanceof Error ? caught.message : "Não foi possível guardar a apresentação.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const openVideoExport = useCallback(() => {
    setIsPlaying(false);
    setVideoExportOpen(true);
  }, [setIsPlaying]);
  const closeVideoExport = useCallback(() => setVideoExportOpen(false), []);

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
      <TopBar filename={filename} isVideoSlide={isVideoSlide} onOpen={() => inputRef.current?.click()} onPreview={openPreview} onCapture={captureAsImageSlide} onCloud={() => setCloudOpen(true)} onProjects={() => setProjectsOpen(true)} onSave={() => void saveProject()} onExport={openVideoExport} onLogout={() => void logout()} projectName={projectName} saveState={saveState} account={account} />
      {notice && <button className="editor-notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
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
      {cloudOpen && <CloudLibraryModal onSelect={selectCloudAsset} onClose={() => setCloudOpen(false)} />}
      {projectsOpen && <ProjectLibraryModal slides={slides} selectedSlideId={selectedSlideId} activeDrawings={drawings} onClose={() => setProjectsOpen(false)} onOpen={(project) => { setProjectId(project.id); setProjectName(project.name); replacePresentation(project.slides); setSaveState("idle"); }} />}
      {presenting && <PresentationMode onClose={closePreview} />}
      {videoExportOpen && <VideoExport slides={slides} selectedSlideId={selectedSlideId} projectName={projectName} onClose={closeVideoExport} />}
    </main>
  );
}
