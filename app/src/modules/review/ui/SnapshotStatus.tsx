// Snapshot 方式では Tour は生成時に埋め込み済みで、起動時に自動で読み込む。
// 対象選択・スタイル・「説明を生成」カードはユーザー指示（2026-08-31）で撤去し、
// 読み込み中とエラーの表示だけを残す。class は撤去前のカードと同じものを使い、
// 見た目の連続性を保つ。
import type { ReviewMode } from "../domain";

export function reviewModeLabel(mode: ReviewMode | undefined): string {
  switch (mode) {
    case "file":
      return "ファイルの説明";
    case "pull_request":
      return "PR差分の説明";
    default:
      return "リポジトリの説明";
  }
}

export type SnapshotStatusViewModel = {
  generationStatus: "idle" | "generating" | "ready" | "error" | "cancelled";
  generationError?: string;
  mode?: ReviewMode;
  onRetry(): void;
};

export function SnapshotStatus({
  generationStatus,
  generationError,
  mode,
  onRetry,
}: SnapshotStatusViewModel) {
  if (generationStatus === "ready") {
    return null;
  }
  const isError = generationStatus === "error";
  return (
    <section
      className={`review-idle${isError ? " is-error" : ""}`}
      role={isError ? "alert" : "status"}
    >
      {isError ? (
        <>
          <span className="generation-error-icon" aria-hidden="true">
            !
          </span>
          <h1>説明を表示できませんでした</h1>
          <p>{generationError ?? "埋め込まれた説明を読み込めませんでした。"}</p>
          <button type="button" className="generation-retry" onClick={onRetry}>
            再試行
          </button>
        </>
      ) : (
        <>
          <span className="generation-spinner" aria-hidden="true" />
          <h1>{reviewModeLabel(mode)}を読み込んでいます</h1>
          <p>このスナップショットに埋め込まれた説明を展開しています。</p>
        </>
      )}
    </section>
  );
}
