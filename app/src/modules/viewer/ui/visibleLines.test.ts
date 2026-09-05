import { describe, expect, it } from "vitest";
import { lineIsVisible } from "./visibleLines";

const ranges = [
  { startLineNumber: 10, endLineNumber: 20 },
  { startLineNumber: 40, endLineNumber: 45 },
];

describe("lineIsVisible", () => {
  it("is true for a line inside any range", () => {
    expect(lineIsVisible(ranges, 15)).toBe(true);
    expect(lineIsVisible(ranges, 42)).toBe(true);
  });

  it("includes both ends of a range", () => {
    expect(lineIsVisible(ranges, 10)).toBe(true);
    expect(lineIsVisible(ranges, 20)).toBe(true);
  });

  it("is false for a line between or outside the ranges", () => {
    expect(lineIsVisible(ranges, 9)).toBe(false);
    expect(lineIsVisible(ranges, 30)).toBe(false);
    expect(lineIsVisible(ranges, 46)).toBe(false);
  });

  it("is false when nothing is visible", () => {
    expect(lineIsVisible([], 1)).toBe(false);
  });
});
