import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge away from the sidebar's sign-out control.
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
  // Parallel dev servers / builds can each use their own output folder (NEXT_DIST_DIR=.next-a next dev -p 3101).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Homework uploads are capped at 4 MB per file (services/files.ts); leave room for the multipart envelope.
    // Vercel itself rejects request bodies above ~4.5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
