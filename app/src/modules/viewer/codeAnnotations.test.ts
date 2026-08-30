import { describe, expect, it } from "vitest";
import {
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

  it("keeps cards ordered and separated inside the viewport when possible", () => {
    const placements = layoutAnnotationCards(
      [
        { id: "a", top: 80, visible: true },
        { id: "b", top: 90, visible: true },
        { id: "c", top: 100, visible: true },
      ],
      400,
      80,
      10,
      10,
    );
    expect(
      placements[1].cardTop - placements[0].cardTop,
    ).toBeGreaterThanOrEqual(90);
    expect(placements[2].cardTop).toBeLessThanOrEqual(310);
    expect(annotationRailHeight(placements, 400, 80, 10)).toBe(400);
  });

  it("stacks cards into a taller scrollable rail when they cannot all fit", () => {
    const anchors = Array.from({ length: 8 }, (_, index) => ({
      id: `a${index}`,
      top: 40 + index * 6,
      visible: true,
    }));

    const placements = layoutAnnotationCards(anchors, 300, 80, 10, 10);

    expect(placements[0].cardTop).toBeGreaterThanOrEqual(10);
    placements.forEach((placement, index) => {
      if (index === 0) return;
      expect(
        placement.cardTop - placements[index - 1].cardTop,
      ).toBeGreaterThanOrEqual(90);
    });
    expect(annotationRailHeight(placements, 300, 80, 10)).toBeGreaterThan(300);
  });

  it("reserves the taller footprint of the expanded selected card", () => {
    const anchors = [
      { id: "a", top: 40, visible: true },
      { id: "b", top: 60, visible: true },
    ];

    const placements = layoutAnnotationCards(
      anchors,
      600,
      80,
      10,
      10,
      "a",
      240,
    );

    expect(
      placements[1].cardTop - placements[0].cardTop,
    ).toBeGreaterThanOrEqual(250);
    expect(annotationRailHeight(placements, 600, 80, 10, "a", 240)).toBe(600);
  });
});
