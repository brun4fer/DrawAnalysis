import type { CSSProperties } from "react";
import type { MatchPresentationSlideContent } from "@/types/slide";
import { SlideMediaBackground } from "../shared/SlideMediaBackground";

interface Props {
  content: MatchPresentationSlideContent;
  playbackTime?: number;
  playing?: boolean;
}

function TeamIdentity({ side, name, crest }: { side: "home" | "away"; name: string; crest?: string }) {
  return (
    <section className={`match-team-card ${side}`}>
      <div className="match-team-crest">
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={crest} alt={`Emblema ${name}`} />
        ) : <span aria-hidden="true" />}
      </div>
      {name && <h2>{name}</h2>}
    </section>
  );
}

export function KickoffSlide({ content, playbackTime, playing }: Props) {
  const style = {
    "--match-home-color": content.homePanelColor ?? "#245b9b",
    "--match-away-color": content.awayPanelColor ?? "#ef6c32",
    "--match-home-text": content.homeTextColor ?? "#ffffff",
    "--match-away-text": content.awayTextColor ?? "#ffffff",
    "--match-info-text": content.informationTextColor ?? "#ffffff",
    "--match-competition-panel": content.competitionPanelColor ?? "#ffffff",
    "--match-competition-text": content.competitionTextColor ?? "#203b2d",
    "--match-accent": content.accentColor ?? "#ffffff",
    "--match-frame": content.frameColor ?? "#ffffff",
    "--match-overlay": content.overlayColor ?? "#071018",
    "--match-overlay-opacity": content.overlayOpacity ?? .24,
    "--match-panel-opacity": `${Math.round((content.panelOpacity ?? .25) * 100)}%`,
    "--match-crest-scale": content.crestScale ?? 1,
  } as CSSProperties;
  const template = content.template ?? "broadcast";

  return (
    <article className={`match-presentation-slide template-${template}`} data-slide-root style={style}>
      <SlideMediaBackground
        url={content.backgroundMediaUrl}
        type={content.backgroundMediaType}
        fit={content.backgroundFit ?? "cover"}
        positionX={content.backgroundPositionX ?? .5}
        positionY={content.backgroundPositionY ?? .5}
        playbackTime={playbackTime}
        playing={playing}
      />
      <div className="match-background-fallback" />
      <div className="match-background-overlay" />
      <div className="match-presentation-frame" />
      <i className="match-side-band home" /><i className="match-side-band away" />

      <div className="match-presentation-content">
        <TeamIdentity side="home" name={content.homeClubName} crest={content.homeCrest} />
        <div className="match-information">
          {(content.competitionLogo || content.competitionName) && <div className="match-competition">
            {content.competitionLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={content.competitionLogo} alt={content.competitionName || "Competição"} />
            ) : content.competitionName ? <span>{content.competitionName}</span> : null}
          </div>}
          {content.matchday && <strong>{content.matchday}</strong>}
          {(content.matchDate || content.matchTime) && <p>{content.matchDate && <span>{content.matchDate}</span>}{content.matchTime && <b>{content.matchTime}</b>}</p>}
        </div>
        <TeamIdentity side="away" name={content.awayClubName} crest={content.awayCrest} />
      </div>
    </article>
  );
}
