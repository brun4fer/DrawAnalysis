import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.153"],
  serverExternalPackages: ["@prisma/client", "@draw-analysis/media-client"],
};

export default nextConfig;
