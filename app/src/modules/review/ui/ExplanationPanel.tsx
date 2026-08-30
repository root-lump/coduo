// 右側パネルの薄い構成コンポーネント。
// Snapshot 方式では Tour が埋め込み済みのため、ReviewSession（説明本体）と
// SnapshotStatus（読み込み中/エラー）だけを持つ。
// 対象選択・スタイル・生成カードと、エージェント設定・利用状況・デバッグ UI は
// 承認済み差分（D3 / 2026-08-31 のユーザー指示）で存在しない。
import { ReviewSession, type ReviewSessionViewModel } from "./ReviewSession";
import {
  SnapshotStatus,
  type SnapshotStatusViewModel,
} from "./SnapshotStatus";

export type ExplanationPanelProps = {
  activeAgentLabel: string;
  session: ReviewSessionViewModel;
  status: SnapshotStatusViewModel;
};

export function ExplanationPanel({
  activeAgentLabel,
  session,
  status,
}: ExplanationPanelProps) {
  return (
    <aside className="explanation-panel" aria-label="コードの説明">
      <div className="explanation-scroll">
        <div className="tour-kicker">
          <span className="pulse-ring" aria-hidden="true">
            <span />
          </span>
          {activeAgentLabel}
        </div>

        {status.generationStatus === "ready" && <ReviewSession {...session} />}

        <SnapshotStatus {...status} />
      </div>
    </aside>
  );
}
