import type { Metadata, Viewport } from "next";
import { themeInitScript } from "@/components/shell/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ascent · CFA® Level I study tracker",
    template: "%s · Ascent",
  },
  description:
    "Track every 2027 CFA Level I module, study hours and mock exams against your plan. Teachers see progress and set homework.",
};

export const viewport: Viewport = {
  themeColor: "#08111d",
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
