import { describe, expect, it } from "vitest";
import type { ReviewTour } from "../domain";
import { agentReviewReducer, type AgentReviewState } from "./agentReviewState";

const tour: ReviewTour = {
  title: "生成済みレビュー",
  summary: "Claude Codeが生成しました。",
  steps: [],
};

const initialState: AgentReviewState = {
  requestId: 0,
  selectionId: 0,
  status: "idle",
};

describe("agentReviewReducer", () => {
  it("stays idle when a workspace is selected", () => {
    const state = agentReviewReducer(initialState, {
      type: "reset",
      repositoryRoot: "/repo/a",
      requestId: 1,
      selectionId: 1,
    });

    expect(state).toEqual({
      repositoryRoot: "/repo/a",
      requestId: 1,
      selectionId: 1,
      status: "idle",
    });
  });

  it("starts only the explicitly selected explanation mode", () => {
    const state = agentReviewReducer(initialState, {
      type: "start",
      repositoryRoot: "/repo/a",
      requestId: 2,
      request: { kind: "file", path: "src/main.ts" },
      selectionId: 1,
      cancelToken: "token-1336",
    });

    expect(state.status).toBe("generating");
    expect(state.request).toEqual({ kind: "file", path: "src/main.ts" });
    expect(state.tour).toBeUndefined();
  });

  it("moves the current request from generating to ready", () => {
    const generating = agentReviewReducer(initialState, {
      type: "start",
      repositoryRoot: "/repo/a",
      requestId: 3,
      request: { kind: "repository" },
      selectionId: 1,
      cancelToken: "token-2155",
    });
    const ready = agentReviewReducer(generating, {
      type: "succeed",
      repositoryRoot: "/repo/a",
      requestId: 3,
      selectionId: 1,
      result: {
        agent: "claude",
        tour,
        warnings: [],
      },
    });

    expect(ready.status).toBe("ready");
    expect(ready.tour).toBe(tour);
    expect(ready.request).toEqual({ kind: "repository" });
  });

  it("keeps an actionable error and the request for retry", () => {
    const generating = agentReviewReducer(initialState, {
      type: "start",
      repositoryRoot: "/repo/a",
      requestId: 4,
      request: { kind: "pull_request" },
      selectionId: 1,
      cancelToken: "token-3083",
    });
    const failed = agentReviewReducer(generating, {
      type: "fail",
      repositoryRoot: "/repo/a",
      requestId: 4,
      selectionId: 1,
      error: {
        agent: "claude",
        code: "internal",
        message: "mainとの差分がありません。",
      },
    });

    expect(failed.status).toBe("error");
    expect(failed.error).toContain("差分");
    expect(failed.request).toEqual({ kind: "pull_request" });
  });

  it("ignores a result from an older workspace request", () => {
    const current = agentReviewReducer(initialState, {
      type: "start",
      repositoryRoot: "/repo/new",
      requestId: 6,
      request: { kind: "repository" },
      selectionId: 2,
      cancelToken: "token-3972",
    });
    const unchanged = agentReviewReducer(current, {
      type: "succeed",
      repositoryRoot: "/repo/old",
      requestId: 5,
      selectionId: 1,
      result: { agent: "claude", tour, warnings: [] },
    });

    expect(unchanged).toBe(current);
  });

  it("ignores an old result after the same path is selected again", () => {
    const current = agentReviewReducer(initialState, {
      type: "reset",
      repositoryRoot: "/repo/same",
      requestId: 8,
      selectionId: 2,
    });
    const unchanged = agentReviewReducer(current, {
      type: "succeed",
      repositoryRoot: "/repo/same",
      requestId: 7,
      selectionId: 1,
      result: { agent: "claude", tour, warnings: [] },
    });

    expect(unchanged).toBe(current);
    expect(unchanged.status).toBe("idle");
  });

  it("moves to cancelled on cancel and ignores the abandoned run", () => {
    const generating = agentReviewReducer(initialState, {
      type: "start",
      repositoryRoot: "/repo/a",
      requestId: 20,
      request: { kind: "repository" },
      selectionId: 1,
      cancelToken: "token-cancel",
    });
    const cancelled = agentReviewReducer(generating, {
      type: "cancel",
      repositoryRoot: "/repo/a",
      requestId: 21,
      selectionId: 1,
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelToken).toBeUndefined();

    // 中止したあとに遅れて届く結果は、新しい requestId で弾かれる。
    const late = agentReviewReducer(cancelled, {
      type: "fail",
      repositoryRoot: "/repo/a",
      requestId: 20,
      selectionId: 1,
      error: {
        agent: "claude",
        code: "cancelled",
        message: "Claude Codeの生成を中止しました。",
      },
    });

    expect(late).toBe(cancelled);
    expect(late.status).toBe("cancelled");
    expect(late.error).toBeUndefined();
  });
});
