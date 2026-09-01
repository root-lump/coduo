/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// monaco-editor の exports map は全サブパスを .js へ写すため、CSS を bare
// specifier で import できない。codicon.css（アイコン用の @font-face を持つ）
// だけは実体パスへ別名を張って読み込む。
const CODICON_CSS = fileURLToPath(
  new URL(
    "./node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css",
    import.meta.url,
  ),
);

// Coduo は単一 HTML の Artifact として配布する。
// worker（Monaco）は ?worker&inline で本体へ埋め込むため、外部 chunk を作らない。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: { "monaco-codicon.css": CODICON_CSS },
  },
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
