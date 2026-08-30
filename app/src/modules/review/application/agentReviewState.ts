import type {
  AgentReviewError,
  AgentReviewResult,
  ReviewRequest,
  ReviewTour,
} from "../domain";

export type AgentReviewState = {
  cancelToken?: string;
  error?: string;
  repositoryRoot?: string;
  request?: ReviewRequest;
  requestId: number;
  selectionId: number;
  status: "idle" | "generating" | "ready" | "error" | "cancelled";
  tour?: ReviewTour;
  warnings?: string[];
};

export type AgentReviewAction =
  | {
      type: "reset";
      repositoryRoot?: string;
      requestId: number;
      selectionId: number;
    }
  | {
      type: "start";
      repositoryRoot: string;
      requestId: number;
      request: ReviewRequest;
      selectionId: number;
      cancelToken: string;
    }
  | {
      type: "cancel";
      repositoryRoot: string;
      requestId: number;
      selectionId: number;
    }
  | {
      type: "succeed";
      repositoryRoot: string;
      requestId: number;
      selectionId: number;
      result: AgentReviewResult;
    }
  | {
      type: "fail";
      repositoryRoot: string;
      requestId: number;
      selectionId: number;
      error: AgentReviewError;
    };

export function agentReviewReducer(
  state: AgentReviewState,
  action: AgentReviewAction,
): AgentReviewState {
  if (action.type === "reset") {
    return {
      repositoryRoot: action.repositoryRoot,
      requestId: action.requestId,
      selectionId: action.selectionId,
      status: "idle",
    };
  }

  if (action.type === "cancel") {
    // 飛んでいる結果は新しい requestId で弾かれる。
    return {
      ...state,
      cancelToken: undefined,
      error: undefined,
      requestId: action.requestId,
      status: "cancelled",
      tour: undefined,
    };
  }

  if (action.type === "start") {
    return {
      repositoryRoot: action.repositoryRoot,
      cancelToken: action.cancelToken,
      requestId: action.requestId,
      request: action.request,
      selectionId: action.selectionId,
      status: "generating",
    };
  }

  if (
    action.requestId !== state.requestId ||
    action.repositoryRoot !== state.repositoryRoot ||
    action.selectionId !== state.selectionId
  ) {
    return state;
  }

  if (action.type === "succeed") {
    return {
      ...state,
      error: undefined,
      status: "ready",
      tour: action.result.tour,
      warnings: action.result.warnings,
    };
  }

  return {
    ...state,
    error: action.error.message,
    status: "error",
    tour: undefined,
  };
}
