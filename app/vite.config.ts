/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Coduo は単一 HTML の Artifact として配布する。
// worker（Monaco）は ?worker&inline で本体へ埋め込むため、外部 chunk を作らない。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  clearScreen: false,
  server: {
    port: 4180,
    strictPort: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["src/shared/test/setup.ts"],
  },
  build: {
    target: "es2022",
    // 単一ファイル化のため asset のインライン上限を実質無制限にする。
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
  },
});
