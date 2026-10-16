import type { TitleSlideContent } from "@/types/slide";
import { APP_PRODUCT } from "@/lib/product";
import { SlideMediaBackground } from "../shared/SlideMediaBackground";
import { titleBackgroundMedia } from "@/utils/slideMedia";

interface Props {
  content: TitleSlideContent;
  playbackTime?: number;
  playing?: boolean;
}

export function TitleSlide({ content, playbackTime, playing }: Props) {
  const media = titleBackgroundMedia(content);
  const hasMedia = Boolean(media.url);
  const backgroundOpacity = content.backgroundOpacity ?? (hasMedia ? .38 : 1);
  const overlayOpacity = content.overlayOpacity ?? (hasMedia ? .62 : .12);
  return (
    <div
      className={`title-slide align-${content.alignment}${content.crestImage ? ` has-crest crest-${content.crestCorner ?? "top-right"}` : ""}`}
      data-slide-root
    >
      <SlideMediaBackground url={media.url} type={media.type} playbackTime={playbackTime} playing={playing} />
      <div className="slide-background-color" style={{ backgroundColor: content.background, opacity: backgroundOpacity }} />
      <div className="slide-background-gradient" style={{ opacity: overlayOpacity }} />
      <div className="slide-accent" style={{ background: content.accentColor ?? "#a3ff12" }} />
      <div className="title-slide-copy">
        <span style={{ color: content.accentColor ?? "#a3ff12" }}>{content.subtitle}</span>
        <h1 style={{ fontSize: `${content.fontSize}px` }}>{content.text}</h1>
        {content.body && <p>{content.body}</p>}
      </div>
      {content.crestImage && (
        <div className={`title-slide-crest ${content.crestCorner ?? "top-right"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={content.crestImage} alt="Emblema do adversário" />
        </div>
      )}
      <div className="slide-corner-mark">{APP_PRODUCT.brandLead.toUpperCase()}<span>{APP_PRODUCT.brandStrong.toUpperCase()}</span></div>
    </div>
  );
}
