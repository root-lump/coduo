/**
 * ジャンプの種類。
 * callee: 呼び出し先（関数や型の定義）へ踏み込む / data_flow: 値の出どころ（変数や定数の定義）へ
 */
export type JumpKind = "callee" | "data_flow";
