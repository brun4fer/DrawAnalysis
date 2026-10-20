"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AnalysisSlide, SlideContent } from "@/types/slide";
import { TitleSlide } from "./title/TitleSlide";
import { TextSlide } from "./text/TextSlide";
import { LineupSlide } from "./lineup/LineupSlide";
import { KickoffSlide } from "./kickoff/KickoffSlide";
import { TacticalBoardSlide } from "./tactical/TacticalBoardSlide";
import { ImageSlide } from "./image/ImageSlide";
import { VideoSlidePreview } from "./video/VideoSlidePreview";
import { WrittenReportSlide } from "./report/WrittenReportSlide";
import { TeamOverviewSlide } from "./team-overview/TeamOverviewSlide";
import { SlideCaption } from "./SlideCaption";

interface Props {
  slide: AnalysisSlide;
  videoEditor?: ReactNode;
  interactive?: boolean;
  onContentChange?: (content: SlideContent) => void;
  presentationTime?: number;
  presentationPlaying?: boolean;
  showCaption?: boolean;
}

export function SlideRenderer({ slide, videoEditor, interactive = true, onContentChange, presentationTime, presentationPlaying, showCaption = true }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [slideScale, setSlideScale] = useState(1);
  const content = slide.content;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateScale = () => setSlideScale(Math.min(stage.clientWidth / 1280, stage.clientHeight / 720));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [content.kind]);

  if (content.kind === "video") return <div className="slide-renderer-video-shell">{videoEditor ?? <VideoSlidePreview content={content} slideName={slide.name} playbackTime={presentationTime} playing={presentationPlaying} controls={presentationTime === undefined} />}{showCaption && <SlideCaption slide={slide} />}</div>;

  const rendered = (() => {
    switch (content.kind) {
      case "title": return <TitleSlide content={content} playbackTime={presentationTime} playing={presentationPlaying} />;
      case "text": return <TextSlide content={content} />;
      case "lineup": return <LineupSlide content={content} interactive={interactive} onChange={(value) => onContentChange?.(value)} playbackTime={presentationTime} playing={presentationPlaying} />;
      case "team-overview": return <TeamOverviewSlide content={content} />;
      case "written-report": return <WrittenReportSlide content={content} interactive={interactive} onChange={(value) => onContentChange?.(value)} />;
      case "kickoff": return <KickoffSlide content={content} playbackTime={presentationTime} playing={presentationPlaying} />;
      case "tactical-board": return <TacticalBoardSlide content={content} interactive={interactive} onChange={(value) => onContentChange?.(value)} presentationTime={presentationTime} />;
      case "image": return <ImageSlide content={content} />;
    }
  })();

  return <div className="slide-stage-shell"><div className="slide-stage" ref={stageRef}><div className="slide-design-canvas" style={{ "--slide-scale": slideScale } as CSSProperties}>{rendered}{showCaption && <SlideCaption slide={slide} />}</div></div></div>;
}
