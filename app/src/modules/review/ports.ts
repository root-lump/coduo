// review module が外界に要求する能力。実装は src/infrastructure/artifact。
import type { AgentReviewResult, ReviewRequest } from "./domain";

export interface ReviewGateway {
  review(request: ReviewRequest, cancelToken: string): Promise<AgentReviewResult>;
  cancel(token: string): Promise<void>;
}
