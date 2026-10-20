import { ImageIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { TeamOverviewSlideContent } from "@/types/slide";

interface Props {
  content: TeamOverviewSlideContent;
}

function GeneralFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="team-overview-fact">
      <dt>{label}</dt>
      <dd>{value.trim() || "—"}</dd>
    </div>
  );
}

export function TeamOverviewSlide({ content }: Props) {
  const template = content.template ?? "reference";
  const style = {
    "--team-overview-panel": content.panelColor ?? (template === "light" ? "#f2f3f1" : "#0d1312"),
    "--team-overview-text": content.textColor ?? (template === "light" ? "#151918" : "#f3f5f4"),
    "--team-overview-muted": content.mutedTextColor ?? (template === "light" ? "#65706a" : "#87918c"),
    "--team-overview-accent": content.accentColor ?? "#a3ff12",
    "--team-overview-image-width": `${Math.round((content.imageRatio ?? .58) * 100)}%`,
    "--team-overview-team-size": content.teamFontSize ?? 54,
    "--team-overview-value-size": content.valueFontSize ?? 20,
  } as CSSProperties;
  const systems = (content.tacticalSystems ?? []).filter((system) => system.trim());

  return (
    <article className={`team-overview-slide template-${template}`} data-slide-root style={style}>
      <section className="team-overview-information">
        <header>
          <span>{content.eyebrow || "DADOS GERAIS DA EQUIPA"}</span>
          <h1>{content.team || "Equipa adversária"}</h1>
        </header>
        <div className="team-overview-rule" />
        <div className="team-overview-details">
          <h2>DADOS GERAIS</h2>
          <dl>
            <GeneralFact label="ESTÁDIO" value={content.stadium} />
            <GeneralFact label="DIMENSÕES" value={content.pitchDimensions} />
            <GeneralFact label="METEOROLOGIA" value={content.weather} />
            <GeneralFact label="TREINADOR" value={content.coach} />
          </dl>
        </div>
        <div className="team-overview-systems">
          <h2>ESQUEMAS TÁTICOS</h2>
          <div>{systems.length ? systems.map((system, index) => <span key={`${system}-${index}`}>{system}</span>) : <em>—</em>}</div>
        </div>
      </section>

      <figure className="team-overview-stadium">
        {content.stadiumImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.stadiumImage}
            alt={content.stadium ? `Estádio ${content.stadium}` : "Fotografia do estádio"}
            style={{
              objectFit: content.imageFit,
              objectPosition: `${(content.imagePositionX ?? .5) * 100}% ${(content.imagePositionY ?? .5) * 100}%`,
            }}
          />
        ) : (
          <div className="team-overview-image-placeholder"><ImageIcon size={52} /><strong>Fotografia do estádio</strong><span>Adicione a imagem nas propriedades do slide</span></div>
        )}
      </figure>
    </article>
  );
}
