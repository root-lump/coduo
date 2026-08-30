import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_WIDTHS,
  constrainPanelWidths,
  loadPanelWidths,
  parseStoredPanelWidths,
  resolvePanelWidthStorage,
  resizePanelFromDrag,
  savePanelWidths,
} from "./panelSizing";

describe("panel sizing", () => {
  it("keeps valid three-panel widths unchanged", () => {
    expect(constrainPanelWidths({ left: 350, right: 450 }, 1500, true)).toEqual(
      {
        left: 350,
        right: 450,
      },
    );
  });

  it("preserves the opposite panel while constraining a dragged panel", () => {
    expect(
      constrainPanelWidths({ left: 1125, right: 412 }, 1250, true, "left"),
    ).toEqual({
      left: 420,
      right: 412,
    });
    expect(
      constrainPanelWidths({ left: 315, right: 1125 }, 1250, true, "right"),
    ).toEqual({
      left: 315,
      right: 517,
    });
  });

  it("allows the explanation panel to use the available space in file mode", () => {
    expect(
      constrainPanelWidths({ left: 315, right: 1125 }, 1125, false, "right"),
    ).toEqual({
      left: 315,
      right: 716,
    });
  });

  it("enforces panel minimums", () => {
    expect(constrainPanelWidths({ left: 25, right: 38 }, 1500, true)).toEqual({
      left: 225,
      right: 358,
    });
  });

  it("loads valid saved widths and rejects malformed values", () => {
    expect(parseStoredPanelWidths('{"left":310,"right":420}')).toEqual({
      left: 310,
      right: 420,
    });
    expect(parseStoredPanelWidths('{"left":"wide","right":null}')).toEqual(
      DEFAULT_PANEL_WIDTHS,
    );
    expect(parseStoredPanelWidths("not json")).toEqual(DEFAULT_PANEL_WIDTHS);
  });

  it("calculates both resize directions from the drag origin", () => {
    expect(
      resizePanelFromDrag({ left: 315, right: 412 }, "left", 60, 1500, true),
    ).toEqual({
      left: 375,
      right: 412,
    });
    expect(
      resizePanelFromDrag({ left: 315, right: 412 }, "right", -88, 1500, true),
    ).toEqual({
      left: 315,
      right: 500,
    });
  });

  it("persists and restores panel widths", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    savePanelWidths(storage, "panels", { left: 290, right: 410 });
    expect(loadPanelWidths(storage, "panels")).toEqual({
      left: 290,
      right: 410,
    });
  });

  it("falls back safely when storage access is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(loadPanelWidths(unavailableStorage, "panels")).toEqual(
      DEFAULT_PANEL_WIDTHS,
    );
    expect(() =>
      savePanelWidths(unavailableStorage, "panels", { left: 300, right: 400 }),
    ).not.toThrow();
  });

  it("handles an exception while resolving the storage object itself", () => {
    expect(
      resolvePanelWidthStorage(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    ).toBeUndefined();
  });
});
