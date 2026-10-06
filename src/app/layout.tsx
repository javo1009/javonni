import type { Metadata, Viewport } from "next";
import { themeInitScript } from "@/components/shell/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ascent · CFA® Level I study tracker", template: "%s · Ascent" },
  description: "Plan, practise and track every Level I learning objective. Teachers see progress and run homework.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a111a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
