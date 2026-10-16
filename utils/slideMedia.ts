import type { AnalysisSlide, LineupSlideContent, TitleSlideContent } from "@/types/slide";

export function titleBackgroundMedia(content: TitleSlideContent) {
  const url = content.backgroundMediaUrl ?? content.backgroundImage;
  return { url, type: content.backgroundMediaType ?? (url ? "image" as const : undefined) };
}

export function lineupBackgroundMedia(content: LineupSlideContent) {
  return { url: content.backgroundMediaUrl, type: content.backgroundMediaType };
}

export function slideBackgroundVideoUrl(slide: AnalysisSlide) {
  if (slide.content.kind === "title") {
    const media = titleBackgroundMedia(slide.content);
    return media.type === "video" ? media.url : undefined;
  }
  if (slide.content.kind === "lineup") {
    const media = lineupBackgroundMedia(slide.content);
    return media.type === "video" ? media.url : undefined;
  }
  return undefined;
}
