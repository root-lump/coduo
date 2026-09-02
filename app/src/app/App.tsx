import { lazy, Suspense, type CSSProperties } from "react";
import { AppHeader } from "./shell/AppHeader";
import { ChangesPanel } from "../modules/workspace";
import { EmptyWorkspace } from "./shell/EmptyWorkspace";
import { ExplanationPanel } from "../modules/review";
import { PanelResizeHandle } from "./shell/PanelResizeHandle";
import { ReviewNavigation } from "../modules/review";
import type { ReviewMode } from "../modules/review";
import type { CoduoSourceMeta } from "../infrastructure/artifact/payload";

// Coduo の生成エージェントは Claude 固定（D3 承認済み差分でセレクターを持たない）。
const AGENT_LABEL_TEXT = "Claude";

// Monaco を含む viewer は初期バンドルから外し、ワークスペースを開いてから読み込む。
const CodeViewer = lazy(() =>
  import("../modules/viewer/ui/CodeViewer").then((module) => ({
    default: module.CodeViewer,
  })),
);
import { type AppServices } from "./composition";
import { initialViewFor } from "./initialViewFor";
import { useAppController } from "./useAppController";

type AppProps = {
  /** snapshot payload から組んだ services を注入する（テストでは fake）。 */
  services: AppServices;
  /** 埋め込みスナップショットの出自（ヘッダー表示と既定の表示モードに使う）。 */
  source: CoduoSourceMeta;
  /** 起動時に自動表示する Tour のモード。埋め込み Tour のキーと対応する。 */
  initialMode: ReviewMode;
};

function App({ services, source, initialMode }: AppProps) {
  const controller = useAppController(
    services,
    initialMode,
    initialViewFor(source.kind),
  );
  const {
    workspace,
    zoom,
    panelSizing,
    review,
    agentReview,
    tour,
    actions,
    derived,
  } = controller;
  const snapshot = workspace.snapshot;

  const appClassName = derived.hasReviewNavigation
    ? "app-shell app-shell-with-navigation"
    : "app-shell";
  const errorToast = workspace.error && (
    <div className="error-toast" role="alert">
      <span className="error-toast-icon" aria-hidden="true">
        !
      </span>
      <span>{workspace.error}</span>
      <button
        type="button"
        onClick={workspace.dismissError}
        aria-label="メッセージを閉じる"
      >
        ×
      </button>
    </div>
  );

  if (!snapshot) {
    return (
      <div className={appClassName}>
        <AppHeader
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          source={source}
          zoomLevel={zoom.level}
        />
        {/* snapshot は起動時に自動で開くため、ここは読み込み中の一瞬だけ通る。 */}
        <EmptyWorkspace isLoading />
        {errorToast}
      </div>
    );
  }

  const breadcrumbs =
    snapshot.selectionKind === "file"
      ? []
      : (workspace.activeFile?.path.split("/") ?? []);
  const workspaceClassName =
    snapshot.selectionKind === "file"
      ? "workspace-layout workspace-layout-file"
      : "workspace-layout";
  const workspaceStyle = {
    "--left-panel-width": `${panelSizing.widths.left}px`,
    "--right-panel-width": `${panelSizing.widths.right}px`,
  } as CSSProperties;

  return (
    <div className={appClassName}>
      <AppHeader
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        snapshot={snapshot}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        source={source}
        zoomLevel={zoom.level}
      />

      <main
        className={`${workspaceClassName}${panelSizing.isResizing ? " is-resizing" : ""}`}
        ref={panelSizing.containerRef}
        style={workspaceStyle}
      >
        {snapshot.selectionKind === "directory" && (
          <>
            <ChangesPanel
              snapshot={snapshot}
              activePath={workspace.activeFile?.path}
              onSelectFile={actions.selectFileManually}
            />
            <PanelResizeHandle
              label="ファイル一覧の横幅を調整"
              side="left"
              onResizeStart={panelSizing.startResize}
            />
          </>
        )}

        <section className="viewer-panel" aria-label="コードビューア">
          <header className="viewer-header">
            <div className="breadcrumbs" title={workspace.activeFile?.path}>
              <span className="breadcrumb-root">{snapshot.name}</span>
              {breadcrumbs.map((segment, index) => (
                <span className="breadcrumb-part" key={`${segment}-${index}`}>
                  <span className="breadcrumb-separator" aria-hidden="true">
                    ›
                  </span>
                  <span
                    className={
                      index === breadcrumbs.length - 1 ? "current" : ""
                    }
                  >
                    {segment}
                  </span>
                </span>
              ))}
            </div>
            <div className="viewer-header-meta">
              {derived.activeChange && (
                <span className="changed-file-pill">
                  <span aria-hidden="true">●</span>
                  変更行 {workspace.activeChangedLines.length}
                </span>
              )}
              {derived.canShowDiff && (
                <div className="view-mode-switch">
                  <button
                    type="button"
                    className={`view-mode-button${derived.viewMode === "diff" ? " is-active" : ""}`}
                    onClick={actions.toggleViewMode}
                    aria-pressed={derived.viewMode === "diff"}
                  >
                    <span aria-hidden="true">⇄</span>
                    変更前と比べる
                  </button>
                  {derived.viewMode === "diff" && (
                    <button
                      type="button"
                      className="view-mode-button"
                      onClick={actions.toggleSideBySide}
                    >
                      {derived.renderSideBySide ? "1 画面で見る" : "並べて見る"}
                    </button>
                  )}
                </div>
              )}
              <span className="read-only-pill">
                <span aria-hidden="true">◇</span>
                読み取り専用
              </span>
            </div>
          </header>
          <div className="viewer-body">
            <Suspense
              fallback={
                <div className="viewer-loading">エディタを準備しています…</div>
              }
            >
              <CodeViewer
                annotations={derived.codeAnnotations}
                baseText={workspace.activeBaseText}
                file={workspace.activeFile}
                changedLines={workspace.activeChangedLines}
                viewMode={derived.viewMode}
                renderSideBySide={derived.renderSideBySide}
                focus={derived.activeFocus}
                focusToken={review.focusToken}
                isLoading={workspace.isLoadingFile}
                navigationFiles={derived.navigationFiles}
                symbolIndex={derived.symbolIndex}
                onOpenLocation={actions.jumpToLocation}
                jumpTarget={derived.jumpTarget}
                jumpToken={derived.jumpToken}
              />
            </Suspense>
            {workspace.isLoadingFile && <div className="viewer-busy-line" />}
          </div>
        </section>

        <PanelResizeHandle
          label="説明パネルの横幅を調整"
          side="right"
          onResizeStart={panelSizing.startResize}
        />

        <ExplanationPanel
          activeAgentLabel={AGENT_LABEL_TEXT}
          session={{
            tour,
            currentStepIndex: review.currentStepIndex,
            explanation: review.resolvedStep?.explanation,
            relation: review.resolvedStep?.relation,
            isExploring: review.isExploring,
            mode: agentReview.request?.kind,
            warnings: agentReview.warnings ?? [],
            onResume: review.resumeReview,
            onSelectStep: review.goToStep,
          }}
          status={{
            generationStatus: agentReview.status,
            generationError: agentReview.error,
            mode: agentReview.request?.kind ?? initialMode,
            onRetry: actions.retry,
          }}
        />
      </main>

      {derived.hasReviewNavigation && (
        <ReviewNavigation
          currentIndex={review.currentStepIndex}
          total={tour.steps.length}
          onPrevious={review.goPrevious}
          onNext={review.goNext}
        />
      )}

      {errorToast}
    </div>
  );
}

export default App;
