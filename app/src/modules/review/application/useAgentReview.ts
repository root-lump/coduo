import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ReviewRequest, ReviewTour } from "../domain";
import type { RepositorySnapshot } from "../../workspace";
import type { ReviewGateway } from "../ports";
import { normalizeAgentReviewError } from "./normalizeError";
import { agentReviewReducer, type AgentReviewState } from "./agentReviewState";

const initialState: AgentReviewState = {
  requestId: 0,
  selectionId: 0,
  status: "idle",
};

const emptyTour: ReviewTour = {
  title: "",
  summary: "",
  steps: [],
};

type AgentReviewViewState = Omit<AgentReviewState, "tour"> & {
  generate(request: ReviewRequest): void;
  cancel(): void;
  retry(): void;
  tour: ReviewTour;
};

export function useAgentReview(
  agentGateway: ReviewGateway,
  snapshot: RepositorySnapshot | undefined,
  selectionId: number,
): AgentReviewViewState {
  const [state, dispatch] = useReducer(agentReviewReducer, initialState);
  const nextRequestId = useRef(0);

  useEffect(() => {
    dispatch({
      type: "reset",
      repositoryRoot: snapshot?.root,
      requestId: ++nextRequestId.current,
      selectionId,
    });
  }, [selectionId, snapshot?.root]);

  const generate = useCallback(
    (request: ReviewRequest) => {
      if (!snapshot) {
        return;
      }
      const requestId = ++nextRequestId.current;
      const cancelToken = crypto.randomUUID();
      dispatch({
        type: "start",
        repositoryRoot: snapshot.root,
        requestId,
        request,
        selectionId,
        cancelToken,
      });
      void agentGateway.review(request, cancelToken).then(
        (result) => {
          dispatch({
            type: "succeed",
            repositoryRoot: snapshot.root,
            requestId,
            selectionId,
            result,
          });
        },
        (cause: unknown) => {
          dispatch({
            type: "fail",
            repositoryRoot: snapshot.root,
            requestId,
            selectionId,
            error: normalizeAgentReviewError(cause),
          });
        },
      );
    },
    [agentGateway, selectionId, snapshot],
  );

  const cancel = useCallback(() => {
    if (!snapshot || !state.cancelToken) {
      return;
    }
    void agentGateway.cancel(state.cancelToken);
    dispatch({
      type: "cancel",
      repositoryRoot: snapshot.root,
      requestId: ++nextRequestId.current,
      selectionId,
    });
  }, [agentGateway, selectionId, snapshot, state.cancelToken]);

  const retry = useCallback(() => {
    if (state.request) {
      generate(state.request);
    }
  }, [generate, state.request]);

  const stateMatchesSnapshot =
    state.repositoryRoot === snapshot?.root &&
    state.selectionId === selectionId;
  if (!stateMatchesSnapshot) {
    return {
      repositoryRoot: snapshot?.root,
      requestId: nextRequestId.current + 1,
      selectionId,
      status: "idle",
      tour: emptyTour,
      cancel,
      generate,
      retry,
    };
  }

  return {
    ...state,
    tour: state.tour ?? emptyTour,
    cancel,
    generate,
    retry,
  };
}
