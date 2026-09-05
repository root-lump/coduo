import type { JumpKind, JumpRelation } from "../domain";

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

const JUMP_LABEL: Record<JumpKind, { glyph: string; label: string }> = {
  callee: { glyph: "↘", label: "踏み込む" },
  data_flow: { glyph: "⇢", label: "値を追う" },
};

/** ジャンプの種類に対する表示（右パネルの一覧と、式に出すタグで共用）。 */
export function jumpLabel(kind: JumpKind): { glyph: string; label: string } {
  return JUMP_LABEL[kind];
}
