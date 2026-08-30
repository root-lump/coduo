import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM_INDEX,
  DEFAULT_ZOOM_LEVEL,
  nextZoomIndex,
  ZOOM_LEVELS,
  zoomShortcutFor,
} from "./zoomController";

describe("zoom levels", () => {
  it("starts at 100 percent", () => {
    expect(ZOOM_LEVELS).toEqual([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
    expect(DEFAULT_ZOOM_LEVEL).toBe(1);
    expect(ZOOM_LEVELS[DEFAULT_ZOOM_INDEX]).toBe(DEFAULT_ZOOM_LEVEL);
  });

  it("moves one step at a time and stays within the supported range", () => {
    expect(nextZoomIndex(DEFAULT_ZOOM_INDEX, "in")).toBe(
      DEFAULT_ZOOM_INDEX + 1,
    );
    expect(nextZoomIndex(DEFAULT_ZOOM_INDEX, "out")).toBe(
      DEFAULT_ZOOM_INDEX - 1,
    );
    expect(nextZoomIndex(0, "out")).toBe(0);
    expect(nextZoomIndex(ZOOM_LEVELS.length - 1, "in")).toBe(
      ZOOM_LEVELS.length - 1,
    );
  });
});

describe("zoomShortcutFor", () => {
  it("recognizes Command or Control with the standard zoom keys", () => {
    expect(
      zoomShortcutFor({
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        code: "Equal",
      }),
    ).toBe("in");
    expect(
      zoomShortcutFor({
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        code: "Minus",
      }),
    ).toBe("out");
    expect(
      zoomShortcutFor({
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        code: "NumpadAdd",
      }),
    ).toBe("in");
    expect(
      zoomShortcutFor({
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        code: "NumpadSubtract",
      }),
    ).toBe("out");
  });

  it("ignores unrelated or modified shortcuts", () => {
    expect(
      zoomShortcutFor({
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        code: "Equal",
      }),
    ).toBeUndefined();
    expect(
      zoomShortcutFor({
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        code: "Equal",
      }),
    ).toBeUndefined();
    expect(
      zoomShortcutFor({
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        code: "Digit0",
      }),
    ).toBeUndefined();
  });
});
