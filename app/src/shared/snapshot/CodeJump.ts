import type { CodeRange } from "./CodeRange";
import type { CodeTarget } from "./CodeTarget";
import type { JumpKind } from "./JumpKind";

/**
 * コードジャンプ。今いる範囲の識別子から、その定義へ読み手を連れて行く。
 * ステップとは別の概念で、開いてもステップは動かない。
 */
export type CodeJump = {
  id: string;
  kind: JumpKind;
  /** 飛び先で宣言されている識別子。from の本文と一致する。 */
  symbol: string;
  /**
   * 参照元の式。今いる範囲（ステップの対象、入れ子なら親の to）と同じファイルの
   * 1 行で、列は必須。
   */
  from: CodeRange;
  /** 定義。symbolIndex にある symbol の宣言を range 内に含む。 */
  to: CodeTarget;
  explanation: string;
  /** 入れ子のジャンプ。from は to.range 内にある。 */
  jumps?: CodeJump[];
};
