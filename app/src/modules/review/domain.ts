// レビュー領域の語彙。
// IPC を流れる wire 型の正本は生成物（src/shared/ipc/generated/）であり、
// ここではそれを再輸出する。手書きの複製を作らないこと。
// このファイルに直接定義してよいのは、wire に現れないフロントエンド専用の型だけ。

export type { AgentDebugChannel } from "../../shared/ipc/generated/AgentDebugChannel";
export type { AgentDebugEvent } from "../../shared/ipc/generated/AgentDebugEvent";
export type { AgentDebugPass } from "../../shared/ipc/generated/AgentDebugPass";
export type { AgentDebugTrace } from "../../shared/ipc/generated/AgentDebugTrace";
export type { AgentKind } from "../../shared/ipc/generated/AgentKind";
export type { AgentReviewError } from "../../shared/ipc/generated/AgentReviewError";
export type { AgentReviewResult } from "../../shared/ipc/generated/AgentReviewResult";
export type { AgentUsage } from "../../shared/ipc/generated/AgentUsage";
export type { CodeAnnotation } from "../../shared/ipc/generated/CodeAnnotation";
export type { CodeRange } from "../../shared/ipc/generated/CodeRange";
export type { CodeTarget } from "../../shared/ipc/generated/CodeTarget";
export type { JumpRelation } from "../../shared/ipc/generated/JumpRelation";
export type { ReviewErrorCode } from "../../shared/ipc/generated/ReviewErrorCode";
export type { ReviewRequest } from "../../shared/ipc/generated/ReviewRequest";
export type { ReviewStep } from "../../shared/ipc/generated/ReviewStep";
export type { ReviewStyle } from "../../shared/ipc/generated/ReviewStyle";
export type { ReviewTour } from "../../shared/ipc/generated/ReviewTour";

import type { CodeAnnotation } from "../../shared/ipc/generated/CodeAnnotation";
import type { CodeTarget } from "../../shared/ipc/generated/CodeTarget";
import type { JumpRelation } from "../../shared/ipc/generated/JumpRelation";

// ---- 以下はフロントエンド専用の型（wire には現れない） ----

/** ユーザーが選ぶ「説明する対象」。ReviewRequest の kind に対応する。 */
export type ReviewMode = "repository" | "file" | "pull_request";

/** スタイル選択 UI の状態。ReviewStyle の kind に対応する。 */
export type ReviewStyleKind = "learning" | "diff" | "custom";

/** ステップの action 列を UI が描画できる形に畳み込んだ結果。 */
export type ResolvedReviewStep = {
  file?: string;
  focus?: CodeTarget;
  explanation: string;
  annotations: CodeAnnotation[];
  relation?: JumpRelation;
};
