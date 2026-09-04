import type { CodeRange } from "./CodeRange";
import type { HopKind } from "./HopKind";

/**
 * ステップに来る前の位置（直前のステップの範囲内にある式）。
 * ビューアはこの式を呼び出し元として上段に出し、次のステップへ進む印にもする。
 */
export type StepOrigin = {
  kind: HopKind;
  file: string;
  /** 列は必須。1 行の式（識別子そのもの）を指す。 */
  range: CodeRange;
  /** 式が指すシンボル名。validate-tour が本文と symbolIndex で突き合わせる。 */
  symbol?: string;
};
