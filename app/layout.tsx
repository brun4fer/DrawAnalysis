import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { APP_PRODUCT } from "@/lib/product";

export const metadata: Metadata = {
  title: `${APP_PRODUCT.name} — Football Video Analysis`,
  description: APP_PRODUCT.description,
  applicationName: APP_PRODUCT.name,
  manifest: "/manifest.webmanifest",
  icons: { icon: APP_PRODUCT.iconPath },
  appleWebApp: { capable: true, title: APP_PRODUCT.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0d1112", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
