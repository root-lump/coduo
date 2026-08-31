import type { AgentKind } from "./AgentKind";
import type { ReviewErrorCode } from "./ReviewErrorCode";

export type AgentReviewError = {
  agent: AgentKind;
  code: ReviewErrorCode;
  message: string;
};
