import { describe, expect, it } from "vitest";
import { containerPoint, layoutScaleOf } from "./connectorGeometry";

const containerRect = { left: 100, top: 50, width: 1000, height: 800 };

describe("layoutScaleOf", () => {
  it("is the ratio of the zoomed rect width to the layout width", () => {
    expect(layoutScaleOf(1250, 1000)).toBe(1.25);
    expect(layoutScaleOf(1000, 1000)).toBe(1);
  });

  it("falls back to 1 when a width is not measurable", () => {
    expect(layoutScaleOf(0, 1000)).toBe(1);
    expect(layoutScaleOf(1000, 0)).toBe(1);
  });
});

describe("containerPoint", () => {
  const position = { left: 40, top: 20, height: 18 };

  it("adds the editor offset to the editor-local position at scale 1", () => {
    const editorRect = { left: 100, top: 450, width: 1000, height: 300 };
    expect(containerPoint({ editorRect, containerRect, scale: 1, position })).toEqual({
      x: 40,
      y: 400 + 20 + 9,
    });
  });

  it("converts the zoomed rect offset back to layout px before adding the position", () => {
    // 拡大率 1.25 では矩形が 1.25 倍で返る。エディタの縦オフセットは 400 layout px。
    const editorRect = { left: 100, top: 50 + 400 * 1.25, width: 1250, height: 375 };
    expect(
      containerPoint({ editorRect, containerRect, scale: 1.25, position }),
    ).toEqual({ x: 40, y: 400 + 20 + 9 });
  });

  it("clamps the vertical position to the editor's layout extent", () => {
    const editorRect = { left: 100, top: 50 + 400 * 1.25, width: 1250, height: 375 };
    const above = containerPoint({
      editorRect,
      containerRect,
      scale: 1.25,
      position: { left: 0, top: -100, height: 18 },
    });
    const below = containerPoint({
      editorRect,
      containerRect,
      scale: 1.25,
      position: { left: 0, top: 1000, height: 18 },
    });
    expect(above.y).toBe(400);
    expect(below.y).toBe(400 + 300);
  });
});
