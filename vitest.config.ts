import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The P1 suites boot a shared PGlite socket server on a fixed port per
    // process; serial file execution keeps harnesses deterministic.
    fileParallelism: false,
  },
});
