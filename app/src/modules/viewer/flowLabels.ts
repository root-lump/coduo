import type { HopKind } from "../review";

const PANE_LABELS: Record<HopKind, { top: string; bottom: string }> = {
  callee: { top: "呼び出し元", bottom: "呼び出し先" },
  data_flow: { top: "値の出どころ", bottom: "値の行き先" },
  return: { top: "戻る前の位置", bottom: "戻り先" },
};

/** 分割表示の上段（from）と下段（対象）の役割ラベル。 */
export function paneLabels(kind: HopKind): { top: string; bottom: string } {
  return PANE_LABELS[kind];
}
