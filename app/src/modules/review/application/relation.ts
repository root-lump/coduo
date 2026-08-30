import type { JumpRelation } from "../domain";

const RELATION_LABEL: Record<JumpRelation, string> = {
  definition: "定義",
  reference: "参照",
  caller: "呼び出し元",
  callee: "呼び出し先",
  data_flow: "データフロー",
};

export function relationLabel(relation: JumpRelation): string {
  return RELATION_LABEL[relation];
}
