import type { CodeAnnotation } from "./CodeAnnotation";
import type { CodeTarget } from "./CodeTarget";
import type { JumpRelation } from "./JumpRelation";
import type { StepOrigin } from "./StepOrigin";

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
   * 直前の位置のどの式から来たか。null か省略なら起点、または従来どおりのステップ。
   * 省略可なのは、このフィールドを知らない古い payload をそのまま読むため。
   */
  from?: StepOrigin | null;
  annotations: Array<CodeAnnotation>;
};
