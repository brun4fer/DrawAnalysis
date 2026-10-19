import type { AnalysisSlide } from "@/types/slide";
import { hexToRgba } from "@/utils/color";

export function SlideCaption({ slide, className = "" }: { slide: AnalysisSlide; className?: string }) {
  const segments = (slide.captionSegments ?? []).filter((segment) => segment.text.trim());
  if (!slide.caption.trim() && !segments.length) return null;
  const height = Math.max(.035, Math.min(.2, slide.captionHeight ?? .075));
  const positionY = Math.max(height / 2, Math.min(1 - height / 2, slide.captionPositionY ?? 1 - height / 2));
  return (
    <div
      className={`slide-caption ${className}`}
      style={{
        top: `${positionY * 100}%`,
        minHeight: `${height * 100}%`,
        backgroundColor: hexToRgba(slide.captionBackgroundColor, slide.captionOpacity ?? .74),
        color: slide.captionTextColor ?? "#101010",
        fontSize: `${slide.captionFontSize ?? 22}px`,
      }}
    >
      {segments.length
        ? <span className="slide-caption-segments">{segments.map((segment) => <span key={segment.id} style={{ color: segment.color, fontWeight: segment.bold ? 950 : 500 }}>{segment.text}</span>)}</span>
        : slide.caption}
    </div>
  );
}
