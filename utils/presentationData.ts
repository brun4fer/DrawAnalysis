import type { DrawingObject } from "@/types/drawing";
import type { AnalysisSlide, SlidePlayer } from "@/types/slide";

const withoutEmbeddedData = (value?: string) => value?.startsWith("data:") || value?.startsWith("blob:") ? undefined : value;

const tacticalFillPositions: Record<SlidePlayer["team"], Array<{ name: string; position: { x: number; y: number } }>> = {
  home: [
    { name: "GR", position: { x: .08, y: .50 } },
    { name: "DE", position: { x: .24, y: .12 } },
    { name: "DC", position: { x: .22, y: .37 } },
    { name: "DC", position: { x: .22, y: .63 } },
    { name: "DD", position: { x: .24, y: .88 } },
    { name: "MC", position: { x: .42, y: .25 } },
    { name: "MC", position: { x: .40, y: .50 } },
    { name: "MC", position: { x: .42, y: .75 } },
    { name: "EE", position: { x: .62, y: .16 } },
    { name: "PL", position: { x: .67, y: .50 } },
    { name: "ED", position: { x: .62, y: .84 } },
  ],
  away: [
    { name: "GR", position: { x: .92, y: .50 } },
    { name: "DD", position: { x: .76, y: .12 } },
    { name: "DC", position: { x: .78, y: .37 } },
    { name: "DC", position: { x: .78, y: .63 } },
    { name: "DE", position: { x: .76, y: .88 } },
    { name: "MC", position: { x: .58, y: .25 } },
    { name: "MC", position: { x: .60, y: .50 } },
    { name: "MC", position: { x: .58, y: .75 } },
    { name: "ED", position: { x: .38, y: .16 } },
    { name: "PL", position: { x: .33, y: .50 } },
    { name: "EE", position: { x: .38, y: .84 } },
  ],
};

function completeTacticalTeams(players: SlidePlayer[], slideId: string) {
  const completed = [...players];
  (["home", "away"] as const).forEach((team) => {
    const existingCount = completed.filter((player) => player.team === team).length;
    const missing = Math.max(0, 11 - existingCount);
    for (let index = 0; index < missing; index += 1) {
      const fallback = tacticalFillPositions[team][(existingCount + index) % tacticalFillPositions[team].length];
      completed.push({
        id: `${slideId}-tactical-${team}-${completed.filter((player) => player.team === team).length + 1}`,
        number: completed.filter((player) => player.team === team).length + 1,
        name: fallback.name,
        team,
        position: { ...fallback.position },
      });
    }
  });
  return completed;
}

export function normalizePresentationSlides(slides: AnalysisSlide[]) {
  return slides.map((slide) => {
    const existingCaption = slide.caption ?? slide.question ?? "";
    const tacticalLegacySegments = slide.content.kind === "tactical-board" && !existingCaption.trim()
      ? slide.content.legendSegments ?? [
        { id: "legend-primary", text: slide.content.title || "ORGANIZAÇÃO TÁTICA", color: "#f0442c", bold: true },
        { id: "legend-secondary", text: "# TACTICAL BOARD", color: "#171717", bold: true },
      ]
      : undefined;
    const captionSegments = slide.captionSegments ?? tacticalLegacySegments;
    const caption = existingCaption.trim() || captionSegments?.map((segment) => segment.text.trim()).filter(Boolean).join(" ") || "";
    const migratedTacticalCaption = Boolean(tacticalLegacySegments?.length);
    const normalized = {
      ...slide,
      caption,
      captionSegments,
      captionOpacity: slide.captionOpacity ?? (migratedTacticalCaption ? slide.content.kind === "tactical-board" ? slide.content.legendOpacity ?? 1 : 1 : .74),
      captionBackgroundColor: slide.captionBackgroundColor ?? (slide.content.kind === "tactical-board" ? slide.content.legendBackgroundColor ?? "#ffffff" : "#ffffff"),
      captionTextColor: slide.captionTextColor ?? "#101010",
      captionFontSize: slide.captionFontSize ?? (slide.content.kind === "tactical-board" ? slide.content.legendFontSize ?? 20 : 22),
      captionHeight: slide.captionHeight ?? (slide.content.kind === "tactical-board" ? slide.content.legendHeight ?? .075 : .075),
      captionPositionY: slide.captionPositionY ?? .9625,
      question: undefined,
    };
    if (normalized.content.kind === "title") {
      normalized.content = {
        ...normalized.content,
        accentColor: normalized.content.accentColor ?? "#a3ff12",
        backgroundOpacity: normalized.content.backgroundOpacity ?? (normalized.content.backgroundImage || normalized.content.backgroundMediaUrl ? .38 : 1),
        overlayOpacity: normalized.content.overlayOpacity ?? (normalized.content.backgroundImage || normalized.content.backgroundMediaUrl ? .62 : .12),
        crestCorner: normalized.content.crestCorner ?? "top-right",
        subtitleFontSize: normalized.content.subtitleFontSize ?? 16,
      };
    }
    if (normalized.content.kind === "lineup") {
      const legacyAppearance = normalized.content.panelOpacity === undefined;
      normalized.content = {
        ...normalized.content,
        clubName: normalized.content.clubName ?? normalized.content.title,
        coachName: normalized.content.coachName ?? "",
        tacticalSystems: normalized.content.tacticalSystems ?? [],
        template: normalized.content.template ?? "broadcast",
        background: normalized.content.background ?? "#0a0d0f",
        backgroundOpacity: legacyAppearance ? .08 : normalized.content.backgroundOpacity ?? (normalized.content.backgroundMediaUrl ? .08 : 1),
        overlayOpacity: legacyAppearance ? .18 : normalized.content.overlayOpacity ?? .18,
        panelOpacity: normalized.content.panelOpacity ?? .82,
        frameColor: normalized.content.frameColor ?? "#ffffff",
        pitchColor: normalized.content.pitchColor ?? "#07131a",
        playerNumberSize: normalized.content.playerNumberSize ?? 18,
        playerNameSize: normalized.content.playerNameSize ?? 9,
        playerPhotoScale: normalized.content.playerPhotoScale ?? 1,
        playerCardScale: normalized.content.playerCardScale ?? 1,
        panelScale: normalized.content.panelScale ?? 1,
        miniPlayerColor: normalized.content.miniPlayerColor ?? "#92969a",
        miniPlayerScale: normalized.content.miniPlayerScale ?? 1,
        lineupLabelFontSize: normalized.content.lineupLabelFontSize ?? 7,
        headerBackgroundColor: normalized.content.headerBackgroundColor ?? "#ffffff",
        headerTextColor: normalized.content.headerTextColor ?? "#050505",
        leftFootMarker: normalized.content.leftFootMarker ?? "both",
        leftFootMarkerColor: normalized.content.leftFootMarkerColor ?? "#efff29",
      };
    }
    if (normalized.content.kind === "team-overview") {
      const template = normalized.content.template ?? "reference";
      const palette = template === "light"
        ? { panelColor: "#f2f3f1", textColor: "#151918", mutedTextColor: "#65706a", accentColor: "#467b2b" }
        : template === "accent"
          ? { panelColor: "#172620", textColor: "#ffffff", mutedTextColor: "#a4b3aa", accentColor: "#f0a227" }
          : { panelColor: "#0d1312", textColor: "#f3f5f4", mutedTextColor: "#87918c", accentColor: "#a3ff12" };
      normalized.content = {
        ...normalized.content,
        eyebrow: normalized.content.eyebrow ?? "DADOS GERAIS DA EQUIPA",
        tacticalSystems: normalized.content.tacticalSystems ?? [],
        imageFit: normalized.content.imageFit ?? "cover",
        imagePositionX: normalized.content.imagePositionX ?? .5,
        imagePositionY: normalized.content.imagePositionY ?? .5,
        template,
        panelColor: normalized.content.panelColor ?? palette.panelColor,
        textColor: normalized.content.textColor ?? palette.textColor,
        mutedTextColor: normalized.content.mutedTextColor ?? palette.mutedTextColor,
        accentColor: normalized.content.accentColor ?? palette.accentColor,
        imageRatio: normalized.content.imageRatio ?? .58,
        teamFontSize: normalized.content.teamFontSize ?? 54,
        valueFontSize: normalized.content.valueFontSize ?? 20,
      };
    }
    if (normalized.content.kind === "written-report") {
      const reportDesign = normalized.content.layoutDesign === "light-left" ? "light-right" : normalized.content.layoutDesign ?? "light-right";
      normalized.content = {
        ...normalized.content,
        players: completeTacticalTeams(normalized.content.players, normalized.id),
        title: normalized.content.title ?? normalized.content.moment ?? "ESQUEMA TÁTICO",
        subtitle: normalized.content.subtitle ?? normalized.content.submoment ?? "DESCRIÇÃO",
        layoutDesign: reportDesign,
        awayColor: normalized.content.awayColor ?? "#112d91",
        homeTextColor: normalized.content.homeTextColor ?? "#101010",
        awayTextColor: normalized.content.awayTextColor ?? "#ffffff",
        pitchColor: normalized.content.pitchColor ?? "#4f78a5",
        pitchLineColor: normalized.content.pitchLineColor ?? "#ffffff",
        pitchLineWidth: normalized.content.pitchLineWidth ?? 4,
        panelColor: normalized.content.panelColor ?? (reportDesign === "dark-right" ? "#10161a" : reportDesign === "accent-right" ? "#f04b2f" : "#ffffff"),
        textColor: normalized.content.textColor ?? (reportDesign === "dark-right" || reportDesign === "accent-right" ? "#ffffff" : "#101010"),
        accentColor: normalized.content.accentColor ?? (reportDesign === "dark-right" ? "#a3ff12" : reportDesign === "accent-right" ? "#ffffff" : "#f04b2f"),
        panelOpacity: normalized.content.panelOpacity ?? 1,
        fieldRatio: normalized.content.fieldRatio ?? .55,
        titleFontSize: normalized.content.titleFontSize ?? 44,
        subtitleFontSize: normalized.content.subtitleFontSize ?? 14,
        bodyFontSize: normalized.content.bodyFontSize ?? 21,
        playerSize: normalized.content.playerSize ?? .82,
        ballPosition: normalized.content.ballPosition ?? { x: .5, y: .5 },
        showBall: normalized.content.showBall ?? true,
        diagramMarks: normalized.content.diagramMarks ?? [],
      };
    }
    if (normalized.content.kind === "kickoff") {
      const clearExample = (value: string | undefined, examples: string[]) => value && !examples.includes(value) ? value : "";
      const legacyReference = (normalized.content.designVersion ?? 1) < 2;
      normalized.content = {
        ...normalized.content,
        homeClubName: clearExample(normalized.content.homeClubName, ["FEIRENSE", "EQUIPA DA CASA"]),
        awayClubName: clearExample(normalized.content.awayClubName, ["FIGUEIRAS", "EQUIPA VISITANTE"]),
        competitionName: clearExample(normalized.content.competitionName, ["LIGA PORTUGAL 2", "COMPETIÇÃO"]),
        matchday: clearExample(normalized.content.matchday, ["JORNADA 1", "JORNADA"]),
        matchDate: clearExample(normalized.content.matchDate, ["09 AGOSTO", "DATA"]),
        matchTime: clearExample(normalized.content.matchTime, ["15:30", "HORA"]),
        backgroundFit: normalized.content.backgroundFit ?? "cover",
        backgroundPositionX: normalized.content.backgroundPositionX ?? .5,
        backgroundPositionY: normalized.content.backgroundPositionY ?? .5,
        template: normalized.content.template ?? "broadcast",
        homePanelColor: normalized.content.homePanelColor ?? "#245b9b",
        homeSecondaryColor: normalized.content.homeSecondaryColor ?? "#ffffff",
        awayPanelColor: legacyReference && normalized.content.awayPanelColor === "#ef6c32" ? "#41499e" : normalized.content.awayPanelColor ?? "#41499e",
        awaySecondaryColor: normalized.content.awaySecondaryColor ?? "#ef6c32",
        homeTextColor: normalized.content.homeTextColor ?? "#ffffff",
        awayTextColor: normalized.content.awayTextColor ?? "#ffffff",
        informationTextColor: normalized.content.informationTextColor ?? "#ffffff",
        competitionPanelColor: normalized.content.competitionPanelColor ?? "#ffffff",
        competitionTextColor: normalized.content.competitionTextColor ?? "#203b2d",
        accentColor: normalized.content.accentColor ?? "#ffffff",
        frameColor: normalized.content.frameColor ?? "#ffffff",
        overlayColor: normalized.content.overlayColor ?? "#071018",
        overlayOpacity: legacyReference && normalized.content.overlayOpacity === .24 ? .12 : normalized.content.overlayOpacity ?? .12,
        panelOpacity: legacyReference && normalized.content.panelOpacity === .25 ? .22 : normalized.content.panelOpacity ?? .22,
        crestScale: normalized.content.crestScale ?? 1,
        designVersion: 2,
      };
    }
    if (normalized.content.kind === "tactical-board") {
      normalized.content = {
        ...normalized.content,
        players: completeTacticalTeams(normalized.content.players, normalized.id),
        homeTextColor: normalized.content.homeTextColor ?? "#101010",
        awayTextColor: normalized.content.awayTextColor ?? "#ffffff",
        pitchColor: normalized.content.pitchColor ?? "#4f78a5",
        pitchLineColor: normalized.content.pitchLineColor ?? "#ffffff",
        pitchLineWidth: normalized.content.pitchLineWidth ?? 4,
        playerSize: normalized.content.playerSize ?? 1,
        ballPosition: normalized.content.ballPosition ?? { x: .5, y: .5 },
        showBall: normalized.content.showBall ?? true,
        legendSegments: normalized.content.legendSegments ?? [
          { id: "legend-primary", text: normalized.content.title || "ORGANIZAÇÃO TÁTICA", color: "#f0442c", bold: true },
          { id: "legend-secondary", text: "# TACTICAL BOARD", color: "#171717", bold: true },
        ],
        legendBackgroundColor: normalized.content.legendBackgroundColor ?? "#ffffff",
        legendOpacity: normalized.content.legendOpacity ?? 1,
        legendFontSize: normalized.content.legendFontSize ?? 20,
        legendHeight: normalized.content.legendHeight ?? .075,
        tacticalMarks: normalized.content.tacticalMarks ?? [],
        movements: normalized.content.movements ?? [],
        movementDuration: normalized.content.movementDuration ?? 1.2,
        movementHoldDuration: normalized.content.movementHoldDuration ?? .65,
        markColor: normalized.content.markColor ?? "#fff23d",
        markFillColor: normalized.content.markFillColor ?? "#fff23d",
        markStrokeWidth: normalized.content.markStrokeWidth ?? 5,
        markOpacity: normalized.content.markOpacity ?? 1,
        markDashed: normalized.content.markDashed ?? false,
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
    } else if (copy.content.kind === "kickoff") {
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
