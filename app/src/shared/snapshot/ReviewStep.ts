import type { CodeAnnotation } from "./CodeAnnotation";
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
  annotations: Array<CodeAnnotation>;
};
