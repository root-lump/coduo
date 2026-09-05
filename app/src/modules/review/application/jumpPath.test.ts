import { describe, expect, it } from "vitest";
import type { CodeJump, ReviewStep } from "../domain";
import { parentScopeOf, scopeOf } from "./jumpPath";

const inner: CodeJump = {
  id: "j2",
  kind: "callee",
  symbol: "goToStep",
  from: { startLine: 35, startColumn: 11, endLine: 35, endColumn: 19 },
  to: { file: "controller.ts", range: { startLine: 22, endLine: 32 } },
  explanation: "定義",
};
const outer: CodeJump = {
  id: "j1",
  kind: "callee",
  symbol: "onNext",
  from: { startLine: 55, startColumn: 18, endLine: 55, endColumn: 24 },
  to: { file: "controller.ts", range: { startLine: 34, endLine: 37 } },
  explanation: "定義",
  jumps: [inner],
};
const step: ReviewStep = {
  id: "s1",
  title: "起点",
  explanation: "説明",
  target: { file: "nav.tsx", range: { startLine: 52, endLine: 62 } },
  relation: null,
  jumps: [outer],
  annotations: [],
};

describe("scopeOf", () => {
  it("depth 0 is the step target with the step's jumps", () => {
    expect(scopeOf(step, [])).toEqual({
      file: "nav.tsx",
      range: { startLine: 52, endLine: 62 },
      jumps: [outer],
    });
  });

  it("depth n is the last jump's destination with its nested jumps", () => {
    expect(scopeOf(step, [outer])).toEqual({
      file: "controller.ts",
      range: { startLine: 34, endLine: 37 },
      jumps: [inner],
    });
    expect(scopeOf(step, [outer, inner])).toEqual({
      file: "controller.ts",
      range: { startLine: 22, endLine: 32 },
      jumps: [],
    });
  });

  it("is undefined for overview steps and missing steps", () => {
    expect(scopeOf({ ...step, target: null }, [])).toBeUndefined();
    expect(scopeOf(undefined, [])).toBeUndefined();
  });
});

describe("parentScopeOf", () => {
  it("returns the scope one level up, or undefined at depth 0", () => {
    expect(parentScopeOf(step, [])).toBeUndefined();
    expect(parentScopeOf(step, [outer])?.file).toBe("nav.tsx");
    expect(parentScopeOf(step, [outer, inner])?.range).toEqual({
      startLine: 34,
      endLine: 37,
    });
  });
});
