/**
 * ステップが直前の位置からどう移ってきたか。
 * callee: 呼び出し先へ踏み込む / data_flow: 値の行き先を追う / return: 呼び出し元へ戻る
 */
export type HopKind = "callee" | "data_flow" | "return";
