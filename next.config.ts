import { execSync } from "child_process";
import type { NextConfig } from "next";
import pkg from "./package.json";

// Version shown in the toolbar, stamped at build time:
//  - Docker/VPS builds: APP_VERSION / APP_BUILD_TIME arrive as build args
//    (exported by the deploy workflow on the VPS after `git pull`)
//  - local/dev/desktop builds: read straight from the git repo here
//  - last resort: bare package.json version + current time
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const commitCount = git("rev-list --count HEAD");
const shortSha = git("rev-parse --short HEAD");

const appVersion =
  process.env.APP_VERSION ||
  (commitCount ? `${pkg.version} (build ${commitCount}${shortSha ? ` · ${shortSha}` : ""})` : pkg.version);
const buildTime = process.env.APP_BUILD_TIME || new Date().toISOString();

// Two output modes:
//  - default "standalone": minimal Node server for the VPS Docker image
//  - DESKTOP=1 "export": fully static bundle in out/ for the Electron app
const nextConfig: NextConfig = {
  output: process.env.DESKTOP === "1" ? "export" : "standalone",
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_BUILD_TIME: buildTime,
  },
};

export default nextConfig;
