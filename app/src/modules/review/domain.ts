// レビュー領域の語彙。
// snapshot payload に現れる型の正本は src/shared/snapshot/ であり、
// ここではそれを再輸出する。手書きの複製を作らないこと。
// このファイルに直接定義してよいのは、payload に現れないフロントエンド専用の型だけ。

export type { AgentKind } from "../../shared/snapshot/AgentKind";
export type { AgentReviewError } from "../../shared/snapshot/AgentReviewError";
export type { AgentReviewResult } from "../../shared/snapshot/AgentReviewResult";
export type { CodeAnnotation } from "../../shared/snapshot/CodeAnnotation";
export type { CodeRange } from "../../shared/snapshot/CodeRange";
export type { CodeTarget } from "../../shared/snapshot/CodeTarget";
export type { JumpRelation } from "../../shared/snapshot/JumpRelation";
export type { ReviewErrorCode } from "../../shared/snapshot/ReviewErrorCode";
export type { ReviewRequest } from "../../shared/snapshot/ReviewRequest";
export type { ReviewStep } from "../../shared/snapshot/ReviewStep";
export type { ReviewTour } from "../../shared/snapshot/ReviewTour";

import type { CodeAnnotation } from "../../shared/snapshot/CodeAnnotation";
import type { CodeTarget } from "../../shared/snapshot/CodeTarget";
import type { JumpRelation } from "../../shared/snapshot/JumpRelation";

// ---- 以下はフロントエンド専用の型（snapshot payload には現れない） ----

/** ユーザーが選ぶ「説明する対象」。ReviewRequest の kind に対応する。 */
export type ReviewMode = "repository" | "file" | "pull_request";

/** ステップの action 列を UI が描画できる形に畳み込んだ結果。 */
export type ResolvedReviewStep = {
  file?: string;
  focus?: CodeTarget;
  explanation: string;
  annotations: CodeAnnotation[];
  relation?: JumpRelation;
};
