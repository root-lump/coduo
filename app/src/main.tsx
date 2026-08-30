import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { snapshotServices } from "./app/composition";
import { EmptyWorkspace } from "./app/shell/EmptyWorkspace";
import { devSnapshot } from "./infrastructure/artifact/devSnapshot";
import { loadEmbeddedSnapshot } from "./infrastructure/artifact/payload";
// CSS の読み込み順はカスケードの正であり、ここで明示する。
// base → shell → module 群（workspace / viewer / review）。
import "./shared/styles/base.css";
import "./app/shell/shell.css";
import "./modules/workspace/ui/workspace.css";
import "./modules/viewer/ui/viewer.css";
import "./modules/review/ui/review.css";

// 埋め込み payload が正。無い場合、開発ビルドだけ fixture へフォールバックする。
const payload =
  loadEmbeddedSnapshot() ?? (import.meta.env.DEV ? devSnapshot : null);

// 起動時に自動表示する Tour のモードは出自と 1:1 で決まる
// （collector は source.kind に対応するキーの Tour だけを埋め込む）。
const INITIAL_MODE = {
  repository: "repository",
  "local-directory": "repository",
  pull_request: "pull_request",
  "local-file": "file",
} as const;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {payload ? (
      <App
        services={snapshotServices(payload)}
        source={payload.source}
        initialMode={INITIAL_MODE[payload.source.kind]}
      />
    ) : (
      <EmptyWorkspace isLoading={false} />
    )}
  </StrictMode>,
);
