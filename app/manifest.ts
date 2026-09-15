import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TactiDraw — DrawAnalysis",
    short_name: "TactiDraw",
    description: "Análise de vídeo, desenhos táticos e apresentações de futebol.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#090b0d",
    theme_color: "#a3ff12",
    orientation: "landscape",
    categories: ["sports", "productivity"],
    icons: [{ src: "/tactidraw-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
