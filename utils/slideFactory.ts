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

function kickoffPlayers(): SlidePlayer[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: createId(),
    number: index % 6 + 1,
    name: `J${index % 6 + 1}`,
    team: index < 6 ? "home" as const : "away" as const,
    position: index < 6
      ? { x: .12 + (index % 3) * .15, y: .2 + Math.floor(index / 3) * .6 }
      : { x: .58 + (index % 3) * .15, y: .2 + Math.floor((index - 6) / 3) * .6 },
  }));
}

export function createSlide(type: SlideType, index: number): AnalysisSlide {
  const id = createId();
  const base = { id, type, name: `Slide ${index + 1}`, question: "", duration: 4 };
  switch (type) {
    case "title": return { ...base, name: "Novo capítulo", content: { kind: "title", text: "ORGANIZAÇÃO OFENSIVA", subtitle: "Análise do jogo", body: "", background: "#101914", alignment: "left", fontSize: 64 } };
    case "text": return { ...base, name: "Conclusão", content: { kind: "text", title: "PRINCÍPIO", text: "Forçar o adversário a jogar por fora.", background: "#111518", alignment: "center", fontSize: 44, position: { x: .5, y: .5 } } };
    case "lineup": return { ...base, name: "Escalação", content: { kind: "lineup", formation: "4-3-3", players: playersForFormation("4-3-3"), teamColor: "#a3ff12", goalkeeperColor: "#ffb347", title: "ONZE INICIAL", subtitle: "4-3-3" } };
    case "video": return { ...base, name: "Vídeo / Jogada", duration: 8, content: { kind: "video", fileName: "", startTime: 0, drawings: [] } };
    case "kickoff": return { ...base, name: "Pontapé de saída", content: { kind: "kickoff", players: kickoffPlayers(), homeColor: "#a3ff12", awayColor: "#ef5b67", title: "PONTAPÉ DE SAÍDA", boardObjects: [] } };
    case "tactical-board": return { ...base, name: "Quadro tático", content: { kind: "tactical-board", players: kickoffPlayers(), homeColor: "#4cc9f0", awayColor: "#ff5d73", title: "ORGANIZAÇÃO TÁTICA", boardObjects: [] } };
    case "image": return { ...base, name: "Imagem", content: { kind: "image", fit: "contain", drawings: [] } };
  }
}
