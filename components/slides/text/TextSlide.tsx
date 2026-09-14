import type { TextSlideContent } from "@/types/slide";

export function TextSlide({ content }: { content: TextSlideContent }) {
  return (
    <div className={`text-slide align-${content.alignment}`} style={{ backgroundColor: content.background, backgroundImage: content.backgroundImage ? `linear-gradient(#0b0e10d0, #0b0e10e8), url(${content.backgroundImage})` : undefined }}>
      {content.title && <span className="text-slide-kicker">{content.title}</span>}
      <blockquote style={{ fontSize: `${content.fontSize}px` }}>“{content.text}”</blockquote>
      <div className="text-slide-line" />
    </div>
  );
}
