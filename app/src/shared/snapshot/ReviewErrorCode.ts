/**
 * レビュー生成エラーの安定コード。フロントエンドは message ではなくこの値で分岐する。
 */
export type ReviewErrorCode =
  | "invalid_selection"
  | "unavailable_file"
  | "not_authenticated"
  | "rate_limited"
  | "cancelled"
  | "timed_out"
  | "invalid_output"
  | "internal";
