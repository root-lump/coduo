import { describe, expect, it } from "vitest";
import type { CodeAnnotation, CodeJump, ReviewStep } from "../domain";
import { parentScopeOf, scopeOf } from "./jumpPath";

const innerAnnotation: CodeAnnotation = {
  id: "j2-a1",
  label: "現在位置の更新",
  explanation: "index を state に入れる。",
  target: {
    file: "controller.ts",
    range: { startLine: 24, startColumn: 5, endLine: 24, endColumn: 30 },
  },
};
const inner: CodeJump = {
  id: "j2",
  kind: "callee",
  symbol: "goToStep",
  from: { startLine: 35, startColumn: 11, endLine: 35, endColumn: 19 },
  to: { file: "controller.ts", range: { startLine: 22, endLine: 32 } },
  explanation: "定義",
  annotations: [innerAnnotation, { ...innerAnnotation, id: "" }],
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
const stepAnnotation: CodeAnnotation = {
  id: "s1-a1",
  label: "次へ",
  explanation: "クリックで goNext を呼ぶ。",
  target: {
    file: "nav.tsx",
    range: { startLine: 55, startColumn: 1, endLine: 55, endColumn: 30 },
  },
};
const step: ReviewStep = {
  id: "s1",
  title: "起点",
  explanation: "説明",
  target: { file: "nav.tsx", range: { startLine: 52, endLine: 62 } },
  relation: null,
  jumps: [outer],
  annotations: [stepAnnotation],
};

describe("scopeOf", () => {
  it("depth 0 is the step target with the step's jumps and annotations", () => {
    expect(scopeOf(step, [])).toEqual({
      file: "nav.tsx",
      range: { startLine: 52, endLine: 62 },
      jumps: [outer],
      annotations: [stepAnnotation],
    });
  });

  it("depth n is the last jump's destination with its nested jumps", () => {
    expect(scopeOf(step, [outer])).toEqual({
      file: "controller.ts",
      range: { startLine: 34, endLine: 37 },
      jumps: [inner],
      annotations: [],
    });
    expect(scopeOf(step, [outer, inner])).toMatchObject({
      file: "controller.ts",
      range: { startLine: 22, endLine: 32 },
      jumps: [],
    });
  });

  it("returns the jump's annotations, filling in missing ids from the jump id", () => {
    const annotations = scopeOf(step, [outer, inner])?.annotations;
    expect(annotations?.map((annotation) => annotation.id)).toEqual([
      "j2-a1",
      "j2-annotation-2",
    ]);
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
