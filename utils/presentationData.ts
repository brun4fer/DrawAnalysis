import type { AnalysisSlide } from "@/types/slide";

const withoutEmbeddedData = (value?: string) => value?.startsWith("data:") ? undefined : value;

export function prepareSlidesForStorage(slides: AnalysisSlide[]) {
  return slides.map((slide) => {
    const copy = structuredClone(slide);
    if (copy.content.kind === "video") {
      copy.content.sourceUrl = undefined;
      copy.content.thumbnail = withoutEmbeddedData(copy.content.thumbnail);
    } else if (copy.content.kind === "image") {
      copy.content.imageDataUrl = withoutEmbeddedData(copy.content.imageDataUrl);
    } else if (copy.content.kind === "title" || copy.content.kind === "text") {
      copy.content.backgroundImage = withoutEmbeddedData(copy.content.backgroundImage);
    }
    return copy;
  });
}

export function isPresentationData(value: unknown): value is { slides: AnalysisSlide[] } {
  if (!value || typeof value !== "object" || !("slides" in value)) return false;
  const slides = (value as { slides?: unknown }).slides;
  return Array.isArray(slides) && slides.every((slide) => slide && typeof slide === "object" && "id" in slide && "content" in slide);
}
