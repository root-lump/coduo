// DOM 統合テストの共通セットアップ。
// React 19 では act() を使う環境であることを明示しないと警告が出る。
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom には ResizeObserver がない（usePanelSizing が使う）。
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(window, { ResizeObserver: ResizeObserverStub });
}

afterEach(() => {
  cleanup();
});
