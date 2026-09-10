import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "TactiDraw — Football Video Analysis",
  description: "Local-first football video annotation workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
