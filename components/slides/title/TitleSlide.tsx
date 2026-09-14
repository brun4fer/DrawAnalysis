import type { TitleSlideContent } from "@/types/slide";

export function TitleSlide({ content }: { content: TitleSlideContent }) {
  return (
    <div className={`title-slide align-${content.alignment}`} style={{ backgroundColor: content.background, backgroundImage: content.backgroundImage ? `linear-gradient(#07100ab8, #07100ad9), url(${content.backgroundImage})` : undefined }}>
      <div className="slide-accent" />
      <div className="title-slide-copy">
        <span>{content.subtitle}</span>
        <h1 style={{ fontSize: `${content.fontSize}px` }}>{content.text}</h1>
        {content.body && <p>{content.body}</p>}
      </div>
      <div className="slide-corner-mark">TACTI<span>DRAW</span></div>
    </div>
  );
}
