import { describe, expect, it } from "vitest";
import type { CodeAnnotation, CodeJump, ReviewStep } from "../domain";
import { originScopesOf, scopeOf } from "./jumpPath";

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

  it("reads a step without the annotations key as having no annotations", () => {
    const { annotations: _, ...withoutAnnotations } = step;
    expect(scopeOf(withoutAnnotations, [])?.annotations).toEqual([]);
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

describe("originScopesOf", () => {
  it("is empty at depth 0", () => {
    expect(originScopesOf(step, [], 2)).toEqual([]);
  });

  it("lists the scopes above the bottom pane in ascending depth", () => {
    expect(
      originScopesOf(step, [outer], 2).map(({ depth, scope, jump }) => [
        depth,
        scope.file,
        jump.id,
      ]),
    ).toEqual([[0, "nav.tsx", "j1"]]);
    expect(
      originScopesOf(step, [outer, inner], 2).map(({ depth, scope, jump }) => [
        depth,
        scope.range,
        jump.id,
      ]),
    ).toEqual([
      [0, { startLine: 52, endLine: 62 }, "j1"],
      [1, { startLine: 34, endLine: 37 }, "j2"],
    ]);
  });

  it("keeps only the latest maxOrigins scopes", () => {
    const deepest: CodeJump = { ...inner, id: "j3", jumps: [] };
    const origins = originScopesOf(step, [outer, inner, deepest], 2);
    expect(origins.map((origin) => origin.depth)).toEqual([1, 2]);
    expect(origins.map((origin) => origin.jump.id)).toEqual(["j2", "j3"]);
    expect(origins[1]?.scope.range).toEqual({ startLine: 22, endLine: 32 });
  });

  it("is empty when a scope cannot be derived", () => {
    expect(originScopesOf(undefined, [outer], 2)).toEqual([]);
  });
});
