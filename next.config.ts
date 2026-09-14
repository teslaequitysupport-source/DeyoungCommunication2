import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg (node-postgres) and PGlite must not be bundled — PGlite ships a WASM
  // asset that breaks when processed by the server bundler.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // The floating dev indicator pollutes design QA screenshots (and reads
  // as a stray badge); route errors still surface in the terminal.
  devIndicators: false,
};

export default nextConfig;
