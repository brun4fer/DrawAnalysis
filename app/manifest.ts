import type { MetadataRoute } from "next";
import { APP_PRODUCT } from "@/lib/product";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${APP_PRODUCT.name} — AP Football Analysis`,
    short_name: APP_PRODUCT.name,
    description: APP_PRODUCT.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#090b0d",
    theme_color: "#a3ff12",
    orientation: "landscape",
    categories: ["sports", "productivity"],
    icons: [{ src: APP_PRODUCT.iconPath, sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
