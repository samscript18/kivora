import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kivora intentionally has a root lockfile for E2E/load tooling and a
  // frontend lockfile for the Next.js application. Make the tracing boundary
  // explicit so Next does not guess the monorepo root from those lockfiles.
  outputFileTracingRoot: process.cwd(),
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stripe/crypto": false,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
};

export default nextConfig;
