export type ProductVariant =
  | "tactidraw"
  | "gameplan"
  | "written-report"
  | "individual-written-report"
  | "opponent-player-video-analysis";

export function normalizeProductVariant(value?: string): ProductVariant {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "gameplan") return "gameplan";
  if (["written-report", "report", "relatorio-escrito"].includes(normalized ?? "")) return "written-report";
  if (["individual-written-report", "individual-report", "opponent-player-written-report"].includes(normalized ?? "")) return "individual-written-report";
  if (["opponent-player-video-analysis", "player-video-analysis", "opponent-players-video-analysis"].includes(normalized ?? "")) return "opponent-player-video-analysis";
  return "tactidraw";
}

export function supportsPlayerProfile(variant: ProductVariant) {
  return variant === "individual-written-report" || variant === "opponent-player-video-analysis";
}

export const APP_VARIANT = normalizeProductVariant(process.env.NEXT_PUBLIC_APP_VARIANT);

const PRODUCTS = {
  tactidraw: {
    variant: "tactidraw",
    name: "Opponent Video Analysis",
    brandLead: "Opponent Video ",
    brandStrong: "Analysis",
    mark: "O",
    iconPath: "/tactidraw-icon.svg",
    description: "Análise de vídeo do adversário, desenhos táticos e apresentações de futebol.",
    defaultProjectName: "Apresentação sem título",
  },
  gameplan: {
    variant: "gameplan",
    name: "GamePlan",
    brandLead: "Game",
    brandStrong: "Plan",
    mark: "G",
    iconPath: "/gameplan-icon.svg",
    description: "Planeamento de jogo, desenhos táticos e apresentações de futebol.",
    defaultProjectName: "Plano de jogo sem título",
  },
  "written-report": {
    variant: "written-report",
    name: "Relatório Escrito",
    brandLead: "Relatório",
    brandStrong: "Escrito",
    mark: "R",
    iconPath: "/written-report-icon.svg",
    description: "Relatórios de observação, esquemas táticos e apresentações de futebol.",
    defaultProjectName: "Relatório sem título",
  },
  "individual-written-report": {
    variant: "individual-written-report",
    name: "Individual Written Report",
    brandLead: "Individual ",
    brandStrong: "Written Report",
    mark: "IR",
    iconPath: "/written-report-icon.svg",
    description: "Relatórios individuais, perfis e apresentações dos jogadores adversários.",
    defaultProjectName: "Individual report sem título",
  },
  "opponent-player-video-analysis": {
    variant: "opponent-player-video-analysis",
    name: "Opponent Player Video Analysis",
    brandLead: "Opponent Player ",
    brandStrong: "Video Analysis",
    mark: "PV",
    iconPath: "/tactidraw-icon.svg",
    description: "Análise individual em vídeo dos jogadores adversários.",
    defaultProjectName: "Player video analysis sem título",
  },
} as const satisfies Record<ProductVariant, {
  variant: ProductVariant;
  name: string;
  brandLead: string;
  brandStrong: string;
  mark: string;
  iconPath: string;
  description: string;
  defaultProjectName: string;
}>;

export const APP_PRODUCT = PRODUCTS[APP_VARIANT];
