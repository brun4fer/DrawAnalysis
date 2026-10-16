import type { DrawingObject } from "@/types/drawing";
import type { AnalysisSlide } from "@/types/slide";

const withoutEmbeddedData = (value?: string) => value?.startsWith("data:") || value?.startsWith("blob:") ? undefined : value;

export function normalizePresentationSlides(slides: AnalysisSlide[]) {
  return slides.map((slide) => {
    const normalized = {
      ...slide,
      caption: slide.caption ?? slide.question ?? "",
      captionOpacity: slide.captionOpacity ?? .74,
      question: undefined,
    };
    if (normalized.content.kind === "title") {
      normalized.content = {
        ...normalized.content,
        accentColor: normalized.content.accentColor ?? "#a3ff12",
        backgroundOpacity: normalized.content.backgroundOpacity ?? (normalized.content.backgroundImage || normalized.content.backgroundMediaUrl ? .38 : 1),
        overlayOpacity: normalized.content.overlayOpacity ?? (normalized.content.backgroundImage || normalized.content.backgroundMediaUrl ? .62 : .12),
        crestCorner: normalized.content.crestCorner ?? "top-right",
      };
    }
    if (normalized.content.kind === "lineup") {
      normalized.content = {
        ...normalized.content,
        clubName: normalized.content.clubName ?? normalized.content.title,
        coachName: normalized.content.coachName ?? "",
        template: normalized.content.template ?? "broadcast",
        background: normalized.content.background ?? "#0a0d0f",
        backgroundOpacity: normalized.content.backgroundOpacity ?? (normalized.content.backgroundMediaUrl ? .3 : 1),
        overlayOpacity: normalized.content.overlayOpacity ?? .62,
      };
    }
    return normalized;
  });
}

export function prepareSlidesForStorage(
  slides: AnalysisSlide[],
  active?: { selectedSlideId: string | null; drawings: DrawingObject[] },
) {
  return normalizePresentationSlides(slides).map((slide) => {
    const copy = structuredClone(slide);
    if (copy.content.kind === "video") {
      if (slide.id === active?.selectedSlideId) copy.content.drawings = structuredClone(active.drawings);
      copy.content.sourceUrl = undefined;
      copy.content.thumbnail = withoutEmbeddedData(copy.content.thumbnail);
    } else if (copy.content.kind === "image") {
      copy.content.imageDataUrl = withoutEmbeddedData(copy.content.imageDataUrl);
    } else if (copy.content.kind === "title") {
      copy.content.backgroundImage = withoutEmbeddedData(copy.content.backgroundImage);
      if (copy.content.backgroundMediaType === "video") copy.content.backgroundMediaUrl = withoutEmbeddedData(copy.content.backgroundMediaUrl);
    } else if (copy.content.kind === "lineup") {
      if (copy.content.backgroundMediaType === "video") copy.content.backgroundMediaUrl = withoutEmbeddedData(copy.content.backgroundMediaUrl);
    } else if (copy.content.kind === "text") {
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
