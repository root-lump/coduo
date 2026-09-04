import { describe, expect, it } from "vitest";
import {
  isInsideHop,
  nextHopDecoration,
  originDecoration,
  type NextHop,
} from "./flowDecorations";

const hop: NextHop = {
  kind: "callee",
  target: {
    file: "src/a.ts",
    range: { startLine: 34, startColumn: 11, endLine: 34, endColumn: 19 },
  },
};

describe("originDecoration", () => {
  it("marks the expression inline and tints its line", () => {
    const decorations = originDecoration(
      {
        kind: "data_flow",
        file: "src/a.ts",
        range: { startLine: 28, startColumn: 7, endLine: 28, endColumn: 20 },
      },
      100,
    );
    expect(decorations).toHaveLength(2);
    expect(decorations[0].range).toEqual({
      startLineNumber: 28,
      startColumn: 7,
      endLineNumber: 28,
      endColumn: 20,
    });
    expect(decorations[0].options.inlineClassName).toBe(
      "flow-origin-range flow-kind-data_flow",
    );
    expect(decorations[1].options.isWholeLine).toBe(true);
    expect(decorations[1].options.className).toBe("flow-origin-line");
  });

  it("clamps lines beyond the model", () => {
    const [inline] = originDecoration(
      {
        kind: "return",
        file: "src/a.ts",
        range: { startLine: 500, startColumn: 1, endLine: 500, endColumn: 4 },
      },
      12,
    );
    expect(inline.range.startLineNumber).toBe(12);
    expect(inline.range.endLineNumber).toBe(12);
  });
});

describe("nextHopDecoration", () => {
  it("marks the expression with the hop kind", () => {
    const [decoration] = nextHopDecoration(hop, 100);
    expect(decoration.range).toEqual({
      startLineNumber: 34,
      startColumn: 11,
      endLineNumber: 34,
      endColumn: 19,
    });
    expect(decoration.options.inlineClassName).toBe(
      "flow-next-hop flow-kind-callee",
    );
  });
});

describe("isInsideHop", () => {
  it("accepts positions within the expression and rejects its end column", () => {
    expect(isInsideHop(hop, 34, 11)).toBe(true);
    expect(isInsideHop(hop, 34, 18)).toBe(true);
    expect(isInsideHop(hop, 34, 19)).toBe(false);
    expect(isInsideHop(hop, 34, 10)).toBe(false);
    expect(isInsideHop(hop, 33, 12)).toBe(false);
    expect(isInsideHop(undefined, 34, 12)).toBe(false);
  });
});
