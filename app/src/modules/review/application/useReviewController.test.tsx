// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CodeJump, ReviewTour } from "../domain";
import { useReviewController } from "./useReviewController";

const jump: CodeJump = {
  id: "j1",
  kind: "callee",
  symbol: "answer",
  from: { startLine: 1, startColumn: 8, endLine: 1, endColumn: 14 },
  to: { file: "src/lib.rs", range: { startLine: 1, endLine: 3 } },
  explanation: "定義",
};
const nested: CodeJump = { ...jump, id: "j2", symbol: "inner" };
const tour: ReviewTour = {
  title: "t",
  summary: "s",
  steps: [
    {
      id: "s1",
      title: "1",
      explanation: "e",
      target: { file: "src/lib.rs", range: { startLine: 1, endLine: 3 } },
      relation: null,
      jumps: [jump],
      annotations: [],
    },
    {
      id: "s2",
      title: "2",
      explanation: "e",
      target: { file: "src/lib.rs", range: { startLine: 1, endLine: 3 } },
      relation: null,
      annotations: [],
    },
  ],
};

describe("useReviewController jump path", () => {
  it("opens jumps in order and closes them when the step changes", () => {
    const { result } = renderHook(() => useReviewController(tour));
    act(() => result.current.openJump(jump));
    act(() => result.current.openJump(nested));
    expect(result.current.jumpPath.map((j) => j.id)).toEqual(["j1", "j2"]);

    act(() => result.current.goNext());
    expect(result.current.currentStepIndex).toBe(1);
    expect(result.current.jumpPath).toEqual([]);
  });

  it("backToDepth keeps the first n jumps", () => {
    const { result } = renderHook(() => useReviewController(tour));
    act(() => result.current.openJump(jump));
    act(() => result.current.openJump(nested));
    act(() => result.current.backToDepth(1));
    expect(result.current.jumpPath.map((j) => j.id)).toEqual(["j1"]);
    act(() => result.current.backToDepth(0));
    expect(result.current.jumpPath).toEqual([]);
  });

  it("exploring closes the jumps", () => {
    const { result } = renderHook(() => useReviewController(tour));
    act(() => result.current.openJump(jump));
    act(() => result.current.markExploring());
    expect(result.current.isExploring).toBe(true);
    expect(result.current.jumpPath).toEqual([]);
  });
});
