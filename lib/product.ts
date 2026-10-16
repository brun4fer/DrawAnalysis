export type ProductVariant = "tactidraw" | "gameplan" | "written-report";

export function normalizeProductVariant(value?: string): ProductVariant {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "gameplan") return "gameplan";
  if (["written-report", "report", "relatorio-escrito"].includes(normalized ?? "")) return "written-report";
  return "tactidraw";
}

export const APP_VARIANT = normalizeProductVariant(process.env.NEXT_PUBLIC_APP_VARIANT);

export const APP_PRODUCT = APP_VARIANT === "gameplan"
  ? {
      variant: APP_VARIANT,
      name: "GamePlan",
      brandLead: "Game",
      brandStrong: "Plan",
      mark: "G",
      iconPath: "/gameplan-icon.svg",
      description: "Planeamento de jogo, desenhos táticos e apresentações de futebol.",
      defaultProjectName: "Plano de jogo sem título",
    }
  : APP_VARIANT === "written-report"
    ? {
      variant: APP_VARIANT,
      name: "Relatório Escrito",
      brandLead: "Relatório",
      brandStrong: "Escrito",
      mark: "R",
      iconPath: "/written-report-icon.svg",
      description: "Relatórios de observação, esquemas táticos e apresentações de futebol.",
      defaultProjectName: "Relatório sem título",
    }
  : {
      variant: APP_VARIANT,
      name: "Opponent Video Analysis",
      brandLead: "Opponent Video ",
      brandStrong: "Analysis",
      mark: "O",
      iconPath: "/tactidraw-icon.svg",
      description: "Análise de vídeo do adversário, desenhos táticos e apresentações de futebol.",
      defaultProjectName: "Apresentação sem título",
    };
