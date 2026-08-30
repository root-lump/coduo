import type { CoduoSourceMeta } from "../../infrastructure/artifact/payload";
import type { RepositorySnapshot } from "../../modules/workspace";
import { ZoomControls } from "./ZoomControls";

type AppHeaderProps = {
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn(): void;
  onZoomOut(): void;
  snapshot?: RepositorySnapshot;
  source: CoduoSourceMeta;
  zoomLevel: number;
};

function sourceBadge(source: CoduoSourceMeta): string {
  switch (source.kind) {
    case "pull_request":
      return source.pullNumber != null ? `PR #${source.pullNumber}` : "PR";
    case "repository":
      return "Git";
    case "local-file":
      return "ファイル";
    default:
      return "フォルダ";
  }
}

export function AppHeader({
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  snapshot,
  source,
  zoomLevel,
}: AppHeaderProps) {
  const shortRevision = source.revision.slice(0, 7);
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
        </span>
        <span>Coduo</span>
      </div>
      <div className="header-context">
        {snapshot && (
          <>
            <span className="repository-name">{source.name}</span>
            {snapshot.selectionKind === "directory" && (
              <>
                <span className="context-divider" aria-hidden="true">
                  /
                </span>
                <span className="branch-icon" aria-hidden="true">
                  ⑂
                </span>
                <span className="branch-name">
                  {snapshot.branch ?? "ブランチなし"}
                </span>
              </>
            )}
            <span className="plain-badge">{sourceBadge(source)}</span>
            <span
              className="plain-badge"
              title={`このスナップショットの固定 revision: ${source.revision}`}
            >
              @{shortRevision}
            </span>
          </>
        )}
      </div>
      <div className="header-actions">
        <ZoomControls
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          level={zoomLevel}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
        />
      </div>
    </header>
  );
}
