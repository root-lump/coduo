import { describe, expect, it } from "vitest";
import type { CodeJump } from "../review";
import {
  definitionDecoration,
  jumpAt,
  jumpDecorations,
  originDecoration,
} from "./flowDecorations";

const goToStep: CodeJump = {
  id: "j1",
  kind: "callee",
  symbol: "goToStep",
  from: { startLine: 34, startColumn: 11, endLine: 34, endColumn: 19 },
  to: { file: "src/a.ts", range: { startLine: 22, endLine: 32 } },
  explanation: "定義",
};
const token: CodeJump = {
  id: "j2",
  kind: "data_flow",
  symbol: "focusToken",
  from: { startLine: 28, startColumn: 7, endLine: 28, endColumn: 17 },
  to: { file: "src/a.ts", range: { startLine: 8, endLine: 8 } },
  explanation: "定義",
};

describe("jumpDecorations", () => {
  it("marks every jump expression with its kind", () => {
    const decorations = jumpDecorations([goToStep, token], 100);
    expect(decorations).toHaveLength(2);
    expect(decorations[0].range).toEqual({
      startLineNumber: 34,
      startColumn: 11,
      endLineNumber: 34,
      endColumn: 19,
    });
    expect(decorations[0].options.inlineClassName).toBe(
      "flow-jump flow-kind-callee",
    );
    expect(decorations[1].options.inlineClassName).toBe(
      "flow-jump flow-kind-data_flow",
    );
  });

  it("clamps lines beyond the model", () => {
    const [decoration] = jumpDecorations(
      [{ ...goToStep, from: { ...goToStep.from, startLine: 500, endLine: 500 } }],
      12,
    );
    expect(decoration.range.startLineNumber).toBe(12);
  });
});

describe("originDecoration", () => {
  it("marks the expression inline and tints its line", () => {
    const decorations = originDecoration(token.from, "data_flow", 100);
    expect(decorations).toHaveLength(2);
    expect(decorations[0].options.inlineClassName).toBe(
      "flow-origin-range flow-kind-data_flow",
    );
    expect(decorations[1].options.isWholeLine).toBe(true);
    expect(decorations[1].options.className).toBe("flow-origin-line");
  });
});

describe("definitionDecoration", () => {
  it("marks the declared identifier, or nothing without an anchor", () => {
    const [decoration] = definitionDecoration({
      path: "src/a.ts",
      lineNumber: 22,
      startColumn: 9,
      endColumn: 17,
    });
    expect(decoration.range).toEqual({
      startLineNumber: 22,
      startColumn: 9,
      endLineNumber: 22,
      endColumn: 17,
    });
    expect(decoration.options.inlineClassName).toBe("flow-definition");
    expect(definitionDecoration(undefined)).toEqual([]);
  });
});

describe("jumpAt", () => {
  it("returns the jump under the position, excluding its end column", () => {
    const jumps = [goToStep, token];
    expect(jumpAt(jumps, 34, 11)?.id).toBe("j1");
    expect(jumpAt(jumps, 34, 18)?.id).toBe("j1");
    expect(jumpAt(jumps, 34, 19)).toBeUndefined();
    expect(jumpAt(jumps, 34, 10)).toBeUndefined();
    expect(jumpAt(jumps, 28, 7)?.id).toBe("j2");
    expect(jumpAt(jumps, 33, 12)).toBeUndefined();
    expect(jumpAt([], 34, 12)).toBeUndefined();
  });
});
