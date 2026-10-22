import type { NextConfig } from "next";

// The app ships this as a standalone server inside the installer
// (scripts/build-server.mjs) and runs it from there. That folder is
// read-only once installed (Program Files, or a translocated .app on
// macOS), so the ISR / fetch cache stays in memory instead of being flushed
// into it.
const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  experimental: { isrFlushToDisk: false },
};

export default nextConfig;
