import { describe, expect, it } from "vitest";
import {
  annotationAnchor,
  annotationAtPosition,
  annotationRailHeight,
  containsCodePosition,
  layoutAnnotationCards,
} from "./codeAnnotations";

describe("code annotations", () => {
  it("uses columns when available and whole lines otherwise", () => {
    expect(
      containsCodePosition(
        { startLine: 2, startColumn: 4, endLine: 2, endColumn: 8 },
        2,
        3,
      ),
    ).toBe(false);
    expect(
      containsCodePosition(
        { startLine: 2, startColumn: 4, endLine: 2, endColumn: 8 },
        2,
        6,
      ),
    ).toBe(true);
    expect(containsCodePosition({ startLine: 3, endLine: 4 }, 4, 99)).toBe(
      true,
    );
  });

  it("finds the annotation containing a clicked code position", () => {
    const annotation = annotationAtPosition(
      [
        {
          id: "a",
          label: "A",
          explanation: "A",
          target: { file: "a.ts", range: { startLine: 5, endLine: 6 } },
        },
      ],
      6,
      20,
    );
    expect(annotation?.id).toBe("a");
  });

  it("keeps cards ordered and separated, centered on their anchors", () => {
    const placements = layoutAnnotationCards(
      [
        { id: "a", top: 80, visible: true },
        { id: "b", top: 90, visible: true },
        { id: "c", top: 100, visible: true },
      ],
      { heightOf: () => 80, gap: 10, margin: 10 },
    );
    expect(placements[0].cardTop).toBe(40);
    expect(
      placements[1].cardTop - placements[0].cardTop,
    ).toBeGreaterThanOrEqual(90);
    expect(placements[2].cardTop).toBeLessThanOrEqual(310);
    expect(annotationRailHeight(placements, 400, 10)).toBe(400);
  });

  it("keeps a card attached to an anchor near the bottom and lets the rail scroll", () => {
    // 表示領域に押し戻すと、低いペインではスクロールしてもカードが動かなくなる。
    const placements = layoutAnnotationCards([{ id: "a", top: 380, visible: true }], {
      heightOf: () => 80,
      gap: 10,
      margin: 10,
    });
    expect(placements[0].cardTop).toBe(340);
    expect(annotationRailHeight(placements, 400, 10)).toBe(430);
  });

  it("stacks cards into a taller scrollable rail when they cannot all fit", () => {
    const anchors = Array.from({ length: 8 }, (_, index) => ({
      id: `a${index}`,
      top: 40 + index * 6,
      visible: true,
    }));

    const placements = layoutAnnotationCards(anchors, {
      heightOf: () => 80,
      gap: 10,
      margin: 10,
    });

    expect(placements[0].cardTop).toBeGreaterThanOrEqual(10);
    placements.forEach((placement, index) => {
      if (index === 0) return;
      expect(
        placement.cardTop - placements[index - 1].cardTop,
      ).toBeGreaterThanOrEqual(90);
    });
    expect(annotationRailHeight(placements, 300, 10)).toBeGreaterThan(300);
  });

  it("reserves the taller footprint of the expanded selected card", () => {
    const anchors = [
      { id: "a", top: 40, visible: true },
      { id: "b", top: 60, visible: true },
    ];

    const placements = layoutAnnotationCards(anchors, {
      heightOf: (id) => (id === "a" ? 240 : 80),
      gap: 10,
      margin: 10,
    });

    expect(
      placements[1].cardTop - placements[0].cardTop,
    ).toBeGreaterThanOrEqual(250);
    expect(annotationRailHeight(placements, 600, 10)).toBe(600);
  });

  it("leaves exactly the gap between cards of different measured heights", () => {
    // カードの高さは見出しの行数と説明文の量で変わる。定数で積むと隙間が広がる。
    const heights: Record<string, number> = { a: 303, b: 137, c: 139 };
    const placements = layoutAnnotationCards(
      [
        { id: "a", top: 40, visible: true },
        { id: "b", top: 60, visible: true },
        { id: "c", top: 80, visible: true },
      ],
      { heightOf: (id) => heights[id] },
    );

    expect(placements[1].cardTop - placements[0].cardTop).toBe(303 + 13);
    expect(placements[2].cardTop - placements[1].cardTop).toBe(137 + 13);
    expect(placements.map((placement) => placement.cardHeight)).toEqual([
      303, 137, 139,
    ]);
  });

  it("does not push the next card down when the selected card stays short", () => {
    const anchors = [
      { id: "a", top: 200, visible: true },
      { id: "b", top: 360, visible: true },
    ];

    const placements = layoutAnnotationCards(anchors, {
      heightOf: () => 137,
    });

    // アンカーどうしが 160px 離れていれば、137 + 13 の押し下げは効かない。
    expect(placements[1].cardTop).toBe(360 - 137 / 2);
  });
});

describe("annotationAnchor", () => {
  const visibleRanges = [{ startLineNumber: 20, endLineNumber: 40 }];

  it("uses the line center for a visible line", () => {
    expect(
      annotationAnchor({
        id: "a",
        lineNumber: 30,
        visibleRanges,
        position: { top: 200, height: 20 },
        viewportHeight: 500,
      }),
    ).toEqual({ id: "a", top: 210, visible: true });
  });

  it("treats a line outside the visible ranges as offscreen even when Monaco returns a position", () => {
    // Monaco は画面外の行にも位置を返す（上に 10 行分スクロールした先など）。
    expect(
      annotationAnchor({
        id: "a",
        lineNumber: 10,
        visibleRanges,
        position: { top: -230, height: 20 },
        viewportHeight: 500,
      }),
    ).toEqual({ id: "a", top: 4, visible: false });
    expect(
      annotationAnchor({
        id: "b",
        lineNumber: 50,
        visibleRanges,
        position: { top: 730, height: 20 },
        viewportHeight: 500,
      }),
    ).toEqual({ id: "b", top: 496, visible: false });
  });

  it("clamps a partially visible line to the viewport", () => {
    expect(
      annotationAnchor({
        id: "a",
        lineNumber: 20,
        visibleRanges,
        position: { top: -15, height: 20 },
        viewportHeight: 500,
      }),
    ).toEqual({ id: "a", top: 0, visible: true });
  });

  it("is offscreen when Monaco has no position", () => {
    expect(
      annotationAnchor({
        id: "a",
        lineNumber: 30,
        visibleRanges,
        position: null,
        viewportHeight: 500,
      }),
    ).toEqual({ id: "a", top: 496, visible: false });
  });
});
