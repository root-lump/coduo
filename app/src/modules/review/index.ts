// review module の公開 API。他 module はここ経由でのみ参照する。
export type {
  AgentKind,
  AgentReviewError,
  AgentReviewResult,
  CodeAnnotation,
  CodeRange,
  CodeTarget,
  HopKind,
  JumpRelation,
  ResolvedReviewStep,
  ReviewErrorCode,
  ReviewMode,
  ReviewRequest,
  ReviewStep,
  ReviewTour,
  StepOrigin,
} from "./domain";
export type { ReviewGateway } from "./ports";
export { useAgentReview } from "./application/useAgentReview";
export { useReviewController } from "./application/useReviewController";
export { normalizeAgentReviewError } from "./application/normalizeError";
export { hopLabel } from "./application/relation";
export {
  ExplanationPanel,
  type ExplanationPanelProps,
} from "./ui/ExplanationPanel";
export { ReviewNavigation } from "./ui/ReviewNavigation";
export { TourMarkdown, type TourMarkdownProps } from "./ui/TourMarkdown";
