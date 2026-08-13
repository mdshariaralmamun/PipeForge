import type { NextConfig } from "next";

// Two output modes:
//  - default "standalone": minimal Node server for the VPS Docker image
//  - DESKTOP=1 "export": fully static bundle in out/ for the Electron app
const nextConfig: NextConfig = {
  output: process.env.DESKTOP === "1" ? "export" : "standalone",
  images: { unoptimized: true },
};

export default nextConfig;
