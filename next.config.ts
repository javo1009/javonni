import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge away from the sidebar's sign-out control.
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
};

export default nextConfig;
