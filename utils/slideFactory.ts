import type { AnalysisSlide, SlidePlayer, SlideType } from "@/types/slide";
import { createId } from "./id";

const FORMATIONS: Record<string, Array<[number, number]>> = {
  "4-3-3": [[.08,.5],[.25,.12],[.23,.37],[.23,.63],[.25,.88],[.48,.22],[.44,.5],[.48,.78],[.75,.16],[.82,.5],[.75,.84]],
  "4-2-3-1": [[.08,.5],[.25,.12],[.23,.37],[.23,.63],[.25,.88],[.45,.34],[.45,.66],[.65,.16],[.62,.5],[.65,.84],[.83,.5]],
  "4-4-2": [[.08,.5],[.25,.12],[.23,.37],[.23,.63],[.25,.88],[.52,.12],[.48,.38],[.48,.62],[.52,.88],[.78,.36],[.78,.64]],
  "3-4-3": [[.08,.5],[.25,.24],[.22,.5],[.25,.76],[.5,.1],[.46,.38],[.46,.62],[.5,.9],[.76,.18],[.82,.5],[.76,.82]],
  "3-5-2": [[.08,.5],[.25,.24],[.22,.5],[.25,.76],[.5,.08],[.47,.3],[.43,.5],[.47,.7],[.5,.92],[.78,.35],[.78,.65]],
};

export const formationNames = Object.keys(FORMATIONS);

export function playersForFormation(formation: string): SlidePlayer[] {
  const positions = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
  return positions.map(([x, y], index) => ({
    id: createId(), number: index + 1, name: index === 0 ? "GR" : `Jogador ${index + 1}`,
    team: "home", position: { x, y },
  }));
}

export function playersForTacticalBoard(): SlidePlayer[] {
  const players: Array<[string, "home" | "away", number, number]> = [
    ["GR", "home", .08, .50], ["DE", "home", .24, .12], ["DC", "home", .22, .37],
    ["DC", "home", .22, .63], ["DD", "home", .24, .88], ["MC", "home", .42, .25],
    ["MC", "home", .40, .50], ["MC", "home", .42, .75], ["EE", "home", .62, .16],
    ["PL", "home", .67, .50], ["ED", "home", .62, .84],
    ["GR", "away", .92, .50], ["DD", "away", .76, .12], ["DC", "away", .78, .37],
    ["DC", "away", .78, .63], ["DE", "away", .76, .88], ["MC", "away", .58, .25],
    ["MC", "away", .60, .50], ["MC", "away", .58, .75], ["ED", "away", .38, .16],
    ["PL", "away", .33, .50], ["EE", "away", .38, .84],
  ];
  return players.map(([name, team, x, y], index) => ({ id: createId(), number: index + 1, name, team, position: { x, y } }));
}

export function createSlide(type: SlideType, index: number): AnalysisSlide {
  const id = createId();
  const base = { id, type, name: `Slide ${index + 1}`, caption: "", captionOpacity: .74, captionBackgroundColor: "#ffffff", captionTextColor: "#101010", captionFontSize: 22, captionHeight: .075, captionPositionY: .9625, duration: 4 };
  switch (type) {
    case "title": return { ...base, name: "Novo momento", content: { kind: "title", text: "ORGANIZAÇÃO OFENSIVA", subtitle: "MOMENTO DO JOGO", body: "", background: "#101914", backgroundOpacity: 1, overlayOpacity: .12, accentColor: "#a3ff12", crestCorner: "top-right", alignment: "left", fontSize: 64, subtitleFontSize: 16 } };
    case "text": return { ...base, name: "Conclusão", content: { kind: "text", title: "PRINCÍPIO", text: "Forçar o adversário a jogar por fora.", background: "#111518", alignment: "center", fontSize: 44, position: { x: .5, y: .5 } } };
    case "lineup": return { ...base, name: "Onze provável", content: { kind: "lineup", formation: "4-3-3", tacticalSystems: [], players: playersForFormation("4-3-3"), teamColor: "#f28c28", goalkeeperColor: "#ffcc00", title: "ONZE PROVÁVEL", subtitle: "4-3-3", clubName: "NOME DO CLUBE", coachName: "Nome do treinador", template: "broadcast", background: "#0a0d0f", backgroundOpacity: .08, overlayOpacity: .18, panelOpacity: .82, frameColor: "#ffffff", pitchColor: "#07131a", playerNumberSize: 18, playerNameSize: 9, playerPhotoScale: 1, playerCardScale: 1, panelScale: 1, miniPlayerColor: "#92969a", miniPlayerScale: 1, lineupLabelFontSize: 7, headerBackgroundColor: "#ffffff", headerTextColor: "#050505", leftFootMarker: "both", leftFootMarkerColor: "#efff29" } };
    case "team-overview": return {
      ...base,
      name: "Dados gerais da equipa",
      duration: 6,
      content: {
        kind: "team-overview",
        eyebrow: "DADOS GERAIS DA EQUIPA",
        team: "Equipa adversária",
        stadium: "Estádio",
        pitchDimensions: "105 × 68 m",
        weather: "A definir",
        coach: "Nome do treinador",
        tacticalSystems: ["4-3-3"],
        imageFit: "cover",
        imagePositionX: .5,
        imagePositionY: .5,
        template: "reference",
        panelColor: "#0d1312",
        textColor: "#f3f5f4",
        mutedTextColor: "#87918c",
        accentColor: "#a3ff12",
        imageRatio: .58,
        teamFontSize: 54,
        valueFontSize: 20,
      },
    };
    case "written-report": return {
      ...base,
      name: "Esquema tático + descrição",
      duration: 8,
      content: {
        kind: "written-report",
        team: "Equipa adversária",
        matchday: "Jornada",
        matchDate: "",
        stadium: "",
        pitchDimensions: "",
        weather: "",
        coach: "",
        generalFields: [],
        tacticalSystems: ["4-3-3"],
        formation: "4-3-3",
        players: playersForTacticalBoard(),
        teamColor: "#f04b2f",
        goalkeeperColor: "#fff23d",
        moment: "Organização ofensiva",
        submoment: "Construção",
        title: "ORGANIZAÇÃO OFENSIVA",
        subtitle: "CONSTRUÇÃO EM 4-3-3",
        description: "A equipa joga num 4-3-3 e alterna a construção curta com a saída a três.",
        diagramMarks: [],
        layoutDesign: "light-right",
        awayColor: "#112d91",
        homeTextColor: "#101010",
        awayTextColor: "#ffffff",
        pitchColor: "#4f78a5",
        pitchLineColor: "#ffffff",
        pitchLineWidth: 4,
        panelColor: "#ffffff",
        textColor: "#101010",
        accentColor: "#f04b2f",
        panelOpacity: 1,
        fieldRatio: .55,
        titleFontSize: 44,
        subtitleFontSize: 14,
        bodyFontSize: 21,
        playerSize: .82,
        ballPosition: { x: .5, y: .5 },
        showBall: true,
      },
    };
    case "video": return { ...base, name: "Vídeo / Jogada", duration: 8, content: { kind: "video", fileName: "", startTime: 0, drawings: [], playerTracks: [] } };
    case "kickoff": return {
      ...base,
      name: "Apresentação de jogo",
      duration: 6,
      content: {
        kind: "kickoff",
        homeClubName: "",
        awayClubName: "",
        competitionName: "",
        matchday: "",
        matchDate: "",
        matchTime: "",
        backgroundFit: "cover",
        backgroundPositionX: .5,
        backgroundPositionY: .5,
        template: "broadcast",
        homePanelColor: "#245b9b",
        homeSecondaryColor: "#ffffff",
        awayPanelColor: "#41499e",
        awaySecondaryColor: "#ef6c32",
        homeTextColor: "#ffffff",
        awayTextColor: "#ffffff",
        informationTextColor: "#ffffff",
        competitionPanelColor: "#ffffff",
        competitionTextColor: "#203b2d",
        accentColor: "#ffffff",
        frameColor: "#ffffff",
        overlayColor: "#071018",
        overlayOpacity: .12,
        panelOpacity: .22,
        crestScale: 1,
        designVersion: 2,
      },
    };
    case "tactical-board": return {
      ...base,
      name: "Quadro tático",
      caption: "CONSTRUÇÃO EM 3x2 # BUILD-UP WITH 3",
      captionSegments: [
        { id: createId(), text: "CONSTRUÇÃO EM 3x2", color: "#f0442c", bold: true },
        { id: createId(), text: "# BUILD-UP WITH 3", color: "#171717", bold: true },
      ],
      captionOpacity: 1,
      captionBackgroundColor: "#ffffff",
      captionFontSize: 20,
      captionHeight: .075,
      captionPositionY: .9625,
      duration: 5,
      content: {
        kind: "tactical-board",
        players: playersForTacticalBoard(),
        homeColor: "#f04b2f",
        awayColor: "#112d91",
        homeTextColor: "#101010",
        awayTextColor: "#ffffff",
        title: "ORGANIZAÇÃO TÁTICA",
        boardObjects: [],
        pitchColor: "#4f78a5",
        pitchLineColor: "#ffffff",
        pitchLineWidth: 4,
        playerSize: 1,
        ballPosition: { x: .5, y: .5 },
        showBall: true,
        tacticalMarks: [],
        movements: [],
        movementDuration: 1.2,
        movementHoldDuration: .65,
        markColor: "#fff23d",
        markFillColor: "#fff23d",
        markStrokeWidth: 5,
        markOpacity: 1,
        markDashed: false,
      },
    };
    case "image": return { ...base, name: "Imagem", content: { kind: "image", fit: "contain", drawings: [] } };
  }
}
