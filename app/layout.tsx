import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "TactiDraw — Football Video Analysis",
  description: "Análise de vídeo, desenhos táticos e apresentações de futebol.",
  applicationName: "TactiDraw",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/tactidraw-icon.svg" },
  appleWebApp: { capable: true, title: "TactiDraw", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0d1112", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
