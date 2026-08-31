// "not-collected" は「readable だがスナップショットの収集範囲外」を表す。
// collector が本文を詰めなかったファイルに付き、viewer はこれを見て理由を出す。
export type FileReadability =
  | "readable"
  | "binary"
  | "too-large"
  | "not-collected";
