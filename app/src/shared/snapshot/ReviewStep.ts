import type { CodeAnnotation } from "./CodeAnnotation";
import type { CodeJump } from "./CodeJump";
import type { CodeTarget } from "./CodeTarget";
import type { JumpRelation } from "./JumpRelation";

export type ReviewStep = {
  id: string;
  title: string;
  explanation: string;
  /**
   * フォーカスするコード範囲。全体を俯瞰する概観ステップでは `None`。
   */
  target: CodeTarget | null;
  /**
   * 直前のステップのコード位置との関係（エージェントが付けたラベル）。
   */
  relation: JumpRelation | null;
  /**
   * 対象範囲内の識別子から定義へ飛ぶジャンプ。省略可なのは、このフィールドを
   * 知らない古い payload をそのまま読むため。
   */
  jumps?: CodeJump[];
  /**
   * ステップの範囲に置く注釈。生成側（validate-tour）は必須として検査するが、
   * 欠けた Tour でも画面全体が落ちないよう、ビューアは欠落を空として読む。
   */
  annotations?: CodeAnnotation[];
};
