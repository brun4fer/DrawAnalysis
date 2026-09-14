"use client";
import type { ReactNode } from "react";
import type { AnalysisSlide, SlideContent } from "@/types/slide";
import { TitleSlide } from "./title/TitleSlide";
import { TextSlide } from "./text/TextSlide";
import { LineupSlide } from "./lineup/LineupSlide";
import { KickoffSlide } from "./kickoff/KickoffSlide";
import { TacticalBoardSlide } from "./tactical/TacticalBoardSlide";
import { ImageSlide } from "./image/ImageSlide";
import { VideoSlidePreview } from "./video/VideoSlidePreview";

interface Props {
  slide: AnalysisSlide;
  videoEditor?: ReactNode;
  interactive?: boolean;
  onContentChange?: (content: SlideContent) => void;
}

export function SlideRenderer({ slide, videoEditor, interactive = true, onContentChange }: Props) {
  const content = slide.content;
  if (content.kind === "video") return <>{videoEditor ?? <VideoSlidePreview content={content} slideName={slide.name} />}</>;

  const rendered = (() => {
    switch (content.kind) {
      case "title": return <TitleSlide content={content} />;
      case "text": return <TextSlide content={content} />;
      case "lineup": return <LineupSlide content={content} interactive={interactive} onChange={(value) => onContentChange?.(value)} />;
      case "kickoff": return <KickoffSlide content={content} interactive={interactive} onChange={(value) => onContentChange?.(value)} />;
      case "tactical-board": return <TacticalBoardSlide content={content} interactive={interactive} onChange={(value) => onContentChange?.(value)} />;
      case "image": return <ImageSlide content={content} />;
    }
  })();

  return <div className="slide-stage-shell"><div className="slide-stage">{rendered}</div></div>;
}
