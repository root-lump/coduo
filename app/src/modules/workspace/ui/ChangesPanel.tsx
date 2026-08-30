import type { ChangeStatus, RepositorySnapshot } from "../domain";
import { FileTree } from "./FileTree";

const STATUS_LABEL: Record<ChangeStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  conflicted: "!",
  untracked: "U",
};

type ChangesPanelProps = {
  activePath?: string;
  onSelectFile(path: string): void;
  snapshot: RepositorySnapshot;
};

export function ChangesPanel({
  activePath,
  onSelectFile,
  snapshot,
}: ChangesPanelProps) {
  return (
    <aside className="changes-panel" aria-label="リポジトリファイル">
      <section className="panel-section changes-section">
        <div className="panel-heading">
          <span>変更</span>
          <span className="count-badge">{snapshot.changes.length}</span>
        </div>
        <div className="change-list" data-testid="change-list">
          {snapshot.changes.length ? (
            snapshot.changes.map((change) => {
              const name = change.path.split("/").at(-1) ?? change.path;
              const directory = change.path.includes("/")
                ? change.path.slice(0, change.path.lastIndexOf("/"))
                : "";
              return (
                <button
                  type="button"
                  key={change.path}
                  className={`change-row ${activePath === change.path ? "is-active" : ""}`}
                  onClick={() => onSelectFile(change.path)}
                  disabled={change.status === "deleted"}
                  title={change.path}
                >
                  <span className="change-file-icon" aria-hidden="true">
                    ‹›
                  </span>
                  <span className="change-file-copy">
                    <span className="change-file-name">{name}</span>
                    {directory && (
                      <span className="change-file-directory">{directory}</span>
                    )}
                  </span>
                  <span className={`status-letter status-${change.status}`}>
                    {STATUS_LABEL[change.status]}
                  </span>
                  <span
                    className="change-state-dot"
                    title={change.staged ? "ステージ済み" : "未ステージ"}
                  >
                    {change.staged ? "●" : "○"}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="panel-empty">作業ツリーに変更はありません。</p>
          )}
        </div>
      </section>

      <section className="panel-section files-section">
        <div className="panel-heading">
          <span>ファイル</span>
          <span className="count-label">{snapshot.files.length}</span>
        </div>
        <nav className="file-tree" aria-label="リポジトリ内のすべてのファイル">
          <FileTree
            files={snapshot.files}
            activePath={activePath}
            onSelect={onSelectFile}
          />
        </nav>
      </section>
    </aside>
  );
}
