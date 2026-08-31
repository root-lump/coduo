import type { AgentKind } from "./AgentKind";
import type { ReviewTour } from "./ReviewTour";

export type AgentReviewResult = {
  agent: AgentKind;
  tour: ReviewTour;
  /**
   * ツアー自体は成立しているが利用者に伝えるべき劣化（注釈修復の失敗など）。
   */
  warnings: Array<string>;
};
