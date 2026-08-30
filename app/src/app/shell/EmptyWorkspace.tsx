// Coduo ではスナップショットが起動時に自動で開くため、この画面は
// 「読み込み中の一瞬」と「payload 不備」のときだけ表示される。
type EmptyWorkspaceProps = {
  isLoading: boolean;
};

export function EmptyWorkspace({ isLoading }: EmptyWorkspaceProps) {
  return (
    <main className="empty-workspace">
      <section
        className="empty-workspace-card"
        aria-labelledby="empty-workspace-title"
      >
        <div className="empty-workspace-mark" aria-hidden="true">
          <span />
          <span />
        </div>
        <h1 id="empty-workspace-title">
          {isLoading
            ? "スナップショットを読み込んでいます…"
            : "スナップショットを読み込めませんでした"}
        </h1>
        <p>
          {isLoading
            ? "埋め込まれたソースコードを展開しています。"
            : "この Artifact に埋め込まれたデータを読み取れません。Claude との会話でスナップショットの再生成を依頼してください。"}
        </p>
      </section>
    </main>
  );
}
