// review module の公開 API。他 module はここ経由でのみ参照する。
export type {
  AgentKind,
  AgentReviewError,
  AgentReviewResult,
  CodeAnnotation,
  CodeJump,
  CodeRange,
  CodeTarget,
  JumpKind,
  JumpRelation,
  ResolvedReviewStep,
  ReviewErrorCode,
  ReviewMode,
  ReviewRequest,
  ReviewStep,
  ReviewTour,
} from "./domain";
export type { ReviewGateway } from "./ports";
export { useAgentReview } from "./application/useAgentReview";
export { useReviewController } from "./application/useReviewController";
export { normalizeAgentReviewError } from "./application/normalizeError";
export { jumpLabel } from "./application/relation";
export { parentScopeOf, scopeOf, type JumpScope } from "./application/jumpPath";
export {
  ExplanationPanel,
  type ExplanationPanelProps,
} from "./ui/ExplanationPanel";
export { ReviewNavigation } from "./ui/ReviewNavigation";
export { TourMarkdown, type TourMarkdownProps } from "./ui/TourMarkdown";
