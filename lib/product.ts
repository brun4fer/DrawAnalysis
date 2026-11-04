export type ProductVariant =
  | "tactidraw"
  | "gameplan"
  | "game-review"
  | "written-report"
  | "individual-written-report"
  | "opponent-player-video-analysis"
  | "our-player-performance-report"
  | "our-player-video-analysis"
  | "collective-training-video-analysis"
  | "individual-training-video-analysis";

export function normalizeProductVariant(value?: string): ProductVariant {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "gameplan") return "gameplan";
  if (["game-review", "game-review-analysis", "match-review"].includes(normalized ?? "")) return "game-review";
  if (["written-report", "report", "relatorio-escrito"].includes(normalized ?? "")) return "written-report";
  if (["individual-written-report", "individual-report", "opponent-player-written-report"].includes(normalized ?? "")) return "individual-written-report";
  if (["opponent-player-video-analysis", "player-video-analysis", "opponent-players-video-analysis"].includes(normalized ?? "")) return "opponent-player-video-analysis";
  if (["our-player-performance-report", "our-players-performance-report", "player-performance-report"].includes(normalized ?? "")) return "our-player-performance-report";
  if (["our-player-video-analysis", "our-players-video-analysis"].includes(normalized ?? "")) return "our-player-video-analysis";
  if (["collective-training-video-analysis", "training-collective-video-analysis"].includes(normalized ?? "")) return "collective-training-video-analysis";
  if (["individual-training-video-analysis", "training-individual-video-analysis"].includes(normalized ?? "")) return "individual-training-video-analysis";
  return "tactidraw";
}

export function supportsPlayerProfile(variant: ProductVariant) {
  return variant === "individual-written-report"
    || variant === "opponent-player-video-analysis"
    || variant === "our-player-performance-report"
    || variant === "our-player-video-analysis"
    || variant === "individual-training-video-analysis";
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
  "game-review": {
    variant: "game-review",
    name: "Game Review",
    brandLead: "Game ",
    brandStrong: "Review",
    mark: "GR",
    iconPath: "/tactidraw-icon.svg",
    description: "Complete match review with video, tactical drawings and presentations.",
    defaultProjectName: "Untitled game review",
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
  "our-player-performance-report": {
    variant: "our-player-performance-report",
    name: "Our Player Performance Report",
    brandLead: "Our Player ",
    brandStrong: "Performance Report",
    mark: "PR",
    iconPath: "/written-report-icon.svg",
    description: "Individual performance reports and presentations for our players.",
    defaultProjectName: "Untitled player performance report",
  },
  "our-player-video-analysis": {
    variant: "our-player-video-analysis",
    name: "Our Player Video Analysis",
    brandLead: "Our Player ",
    brandStrong: "Video Analysis",
    mark: "PV",
    iconPath: "/tactidraw-icon.svg",
    description: "Individual match video analysis and presentations for our players.",
    defaultProjectName: "Untitled player video analysis",
  },
  "collective-training-video-analysis": {
    variant: "collective-training-video-analysis",
    name: "Collective Training Video Analysis",
    brandLead: "Collective Training ",
    brandStrong: "Video Analysis",
    mark: "CT",
    iconPath: "/tactidraw-icon.svg",
    description: "Collective training video analysis, tactical drawings and presentations.",
    defaultProjectName: "Untitled collective training analysis",
  },
  "individual-training-video-analysis": {
    variant: "individual-training-video-analysis",
    name: "Individual Training Video Analysis",
    brandLead: "Individual Training ",
    brandStrong: "Video Analysis",
    mark: "IT",
    iconPath: "/tactidraw-icon.svg",
    description: "Individual training video analysis and presentations for our players.",
    defaultProjectName: "Untitled individual training analysis",
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
