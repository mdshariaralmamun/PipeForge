import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // minimal server bundle for the Docker production image
};

export default nextConfig;
