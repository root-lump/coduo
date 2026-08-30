// Snapshot gateway から返る unknown なエラーを、UI が扱える AgentReviewError の形へ正規化する。
import type { AgentReviewError, ReviewErrorCode } from "../domain";

const ERROR_CODES: readonly ReviewErrorCode[] = [
  "invalid_selection",
  "unavailable_file",
  "not_authenticated",
  "rate_limited",
  "cancelled",
  "timed_out",
  "invalid_output",
  "internal",
];

function isReviewErrorCode(value: unknown): value is ReviewErrorCode {
  return ERROR_CODES.includes(value as ReviewErrorCode);
}

export function normalizeAgentReviewError(cause: unknown): AgentReviewError {
  if (cause && typeof cause === "object") {
    const candidate = cause as Partial<AgentReviewError>;
    if (typeof candidate.message === "string") {
      return {
        agent: "claude",
        code: isReviewErrorCode(candidate.code) ? candidate.code : "internal",
        message: candidate.message,
        usage: candidate.usage ?? null,
        debug: candidate.debug ?? null,
      };
    }
  }
  return {
    agent: "claude",
    code: "internal",
    message: cause instanceof Error ? cause.message : String(cause),
    usage: null,
    debug: null,
  };
}
