import type { HopKind, JumpRelation } from "../domain";

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

const HOP_LABEL: Record<HopKind, { glyph: string; label: string }> = {
  callee: { glyph: "↘", label: "踏み込む" },
  data_flow: { glyph: "⇢", label: "値を追う" },
  return: { glyph: "↩", label: "戻る" },
};

/** from の種類に対する表示（バッジと、次へ進む印のタグで共用）。 */
export function hopLabel(kind: HopKind): { glyph: string; label: string } {
  return HOP_LABEL[kind];
}
