import { describe, expect, it, vi } from "vitest";

vi.mock("@monaco-editor/react", () => ({ default: () => null }));
vi.mock("../monacoEnvironment", () => ({
  monaco: { editor: { ScrollType: { Smooth: 0 } } },
}));

import { shouldRenderCodeAnnotations, splitGridRows } from "./CodeViewer";
import { subscribeToAnnotationEvents } from "./useMonacoViewer";

describe("CodeViewer annotation lifecycle", () => {
  it("keeps dismissed annotations hidden for the same focus token and restores the next step", () => {
    const state = {
      annotationCount: 2,
      dismissedFocusToken: 4,
      hasViewport: true,
    };
    expect(shouldRenderCodeAnnotations({ ...state, focusToken: 4 })).toBe(
      false,
    );
    expect(shouldRenderCodeAnnotations({ ...state, focusToken: 5 })).toBe(true);
  });

  it("requires annotations and a measured viewport", () => {
    expect(
      shouldRenderCodeAnnotations({
        annotationCount: 0,
        focusToken: 1,
        hasViewport: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderCodeAnnotations({
        annotationCount: 1,
        focusToken: 1,
        hasViewport: false,
      }),
    ).toBe(false);
  });

  it("updates for editor scroll, layout, and model changes and disposes every listener", () => {
    const callbacks: Array<() => void> = [];
    const disposals = [vi.fn(), vi.fn(), vi.fn()];
    const source = {
      onDidScrollChange: (callback: () => void) => {
        callbacks.push(callback);
        return { dispose: disposals[0] };
      },
      onDidLayoutChange: (callback: () => void) => {
        callbacks.push(callback);
        return { dispose: disposals[1] };
      },
      onDidChangeModel: (callback: () => void) => {
        callbacks.push(callback);
        return { dispose: disposals[2] };
      },
    };
    const onUpdate = vi.fn();
    const subscription = subscribeToAnnotationEvents(source, onUpdate);
    callbacks.forEach((callback) => callback());
    subscription.dispose();
    expect(onUpdate).toHaveBeenCalledTimes(3);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});

describe("splitGridRows", () => {
  it("matches the fixed two-pane layout when nothing is collapsed", () => {
    expect(splitGridRows(2, new Set())).toBe(
      "auto auto minmax(0, 45fr) auto minmax(0, 55fr)",
    );
  });

  it("gives a collapsed pane only its header", () => {
    expect(splitGridRows(3, new Set([0]))).toBe(
      "auto auto minmax(0, 0fr) auto minmax(0, 45fr) auto minmax(0, 55fr)",
    );
  });

  it("collapses every pane", () => {
    expect(splitGridRows(3, new Set([0, 1, 2]))).toBe(
      "auto auto minmax(0, 0fr) auto minmax(0, 0fr) auto minmax(0, 0fr)",
    );
  });
});
