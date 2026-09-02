// コードビューアの view。Monaco のライフサイクルは useMonacoViewer が持ち、
// ここでは placeholder / エディタ / 注釈レイヤの表示だけを組み立てる。
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useState } from "react";
import { CodeAnnotationLayer } from "./CodeAnnotationLayer";
import type { CodeAnnotation, CodeTarget } from "../../review";
import type { ChangedLine, FileContent } from "../../workspace";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import type { ViewMode } from "../diffView";
import { languageFromPath } from "../language";
import { unavailableMessageFor } from "../unavailableMessage";
import { CODUO_THEME } from "../monacoEnvironment";
import { useMonacoViewer } from "./useMonacoViewer";

/** コードモードと差分モードで見た目を揃えるための共通オプション。 */
const SHARED_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on",
  fontFamily:
    '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
  fontSize: 14,
  lineHeight: 23,
  fontLigatures: true,
  glyphMargin: false,
  folding: true,
  padding: { top: 23, bottom: 30 },
  renderLineHighlight: "line",
  roundedSelection: false,
  scrollBeyondLastLine: false,
  scrollbar: {
    verticalScrollbarSize: 13,
    horizontalScrollbarSize: 13,
  },
  stickyScroll: { enabled: true },
  wordWrap: "off",
  overviewRulerBorder: false,
  overviewRulerLanes: 3,
  contextmenu: true,
} as const;

type CodeViewerProps = {
  annotations: CodeAnnotation[];
  /** 差分モードで左側に出す変更前の全文。復元できていなければ undefined。 */
  baseText?: string;
  changedLines: ChangedLine[];
  file?: FileContent;
  focus?: CodeTarget;
  focusToken: number;
  isLoading: boolean;
  navigationFiles: FileContent[];
  symbolIndex: SymbolIndex | null;
  onOpenLocation(target: CodeTarget): void;
  jumpTarget?: CodeTarget;
  jumpToken: number;
  /** 差分モードで変更前後を左右に並べるか（false なら 1 画面に混ぜて出す）。 */
  renderSideBySide: boolean;
  viewMode: ViewMode;
};

type AnnotationRenderState = {
  annotationCount: number;
  dismissedFocusToken?: number;
  focusToken: number;
  hasViewport: boolean;
};

export function shouldRenderCodeAnnotations({
  annotationCount,
  dismissedFocusToken,
  focusToken,
  hasViewport,
}: AnnotationRenderState): boolean {
  return (
    annotationCount > 0 && hasViewport && dismissedFocusToken !== focusToken
  );
}

export function CodeViewer({
  annotations,
  baseText,
  changedLines,
  file,
  focus,
  focusToken,
  isLoading,
  navigationFiles,
  symbolIndex,
  onOpenLocation,
  jumpTarget,
  jumpToken,
  renderSideBySide,
  viewMode,
}: CodeViewerProps) {
  const [dismissedFocusToken, setDismissedFocusToken] = useState<number>();
  const {
    anchors,
    handleDiffMount,
    handleMount,
    selectAnnotation,
    selectedAnnotationId,
    viewport,
  } = useMonacoViewer({
    annotations,
    changedLines,
    filePath: file?.path,
    focus,
    focusToken,
    navigationFiles,
    symbolIndex,
    onOpenLocation,
    jumpTarget,
    jumpToken,
  });

  if (!file) {
    return (
      <div className="viewer-placeholder">
        <span className="placeholder-glyph" aria-hidden="true">
          ⌘
        </span>
        <strong>
          {isLoading ? "ファイルを開いています…" : "ファイルを選択してください"}
        </strong>
        <span>Coduoではソース全体を確認できます。</span>
      </div>
    );
  }
  if (file.unavailableReason || file.content.length === 0) {
    const message = unavailableMessageFor(file);
    return (
      <div className="viewer-placeholder" role="status">
        <span className="placeholder-glyph" aria-hidden="true">
          ◇
        </span>
        <strong>{file.path}</strong>
        <span>{message}</span>
      </div>
    );
  }

  const language = file.language || languageFromPath(file.path);
  const showAnnotations = shouldRenderCodeAnnotations({
    annotationCount: annotations.length,
    dismissedFocusToken,
    focusToken,
    hasViewport: viewport.height > 0 && viewport.width > 0,
  });
  const viewerClassName = `code-viewer${showAnnotations ? " has-code-annotations" : ""}`;
  const annotationLayer = showAnnotations ? (
    <CodeAnnotationLayer
      anchors={anchors}
      annotations={annotations}
      height={viewport.height}
      onClose={() => setDismissedFocusToken(focusToken)}
      onSelect={(id) => selectAnnotation(id, true)}
      selectedId={selectedAnnotationId}
      width={viewport.width}
    />
  ) : null;

  // 差分モードでも注釈とフォーカス装飾は modified 側に付ける（useMonacoViewer）。
  // 変更行ガター装飾だけは Monaco の差分色と重なるため出さない。
  if (viewMode === "diff" && baseText !== undefined) {
    return (
      <div className={viewerClassName} data-testid="code-viewer">
        <div className="code-editor-surface">
          <DiffEditor
            height="100%"
            original={baseText}
            modified={file.content}
            // 差分エディタは左右とも専用 URI のモデルを使い、コードモードの
            // モデルを共有しない。共有すると、モードを切り替えたときに片方の
            // unmount がもう片方の使っているモデルを破棄し、DiffEditorWidget が
            // 「reset 前に model が破棄された」と例外を投げる。
            originalModelPath={`file://coduo-diff-base/${file.path}`}
            modifiedModelPath={`file://coduo-diff-head/${file.path}`}
            // 専用モデルは破棄せず URI ごとに再利用する（破棄の順序に依存しない）。
            keepCurrentOriginalModel
            keepCurrentModifiedModel
            language={language}
            theme={CODUO_THEME}
            loading={
              <div className="viewer-loading">エディタを準備しています…</div>
            }
            onMount={handleDiffMount}
            options={{
              ...SHARED_EDITOR_OPTIONS,
              readOnly: true,
              originalEditable: false,
              renderSideBySide,
              // 変更のない範囲は畳んで、変わった箇所だけを追えるようにする。
              hideUnchangedRegions: { enabled: true },
              renderOverviewRuler: true,
              // 読み取り専用なので、行余白の revert アイコンと余白メニューは出さない。
              renderMarginRevertIcon: false,
              renderGutterMenu: false,
              minimap: { enabled: false },
            }}
          />
        </div>
        {annotationLayer}
      </div>
    );
  }

  return (
    <div className={viewerClassName} data-testid="code-viewer">
      <div className="code-editor-surface">
        <Editor
          height="100%"
          path={`file://${file.path}`}
          value={file.content}
          language={language}
          theme={CODUO_THEME}
          loading={
            <div className="viewer-loading">エディタを準備しています…</div>
          }
          onMount={handleMount}
          options={{
            ...SHARED_EDITOR_OPTIONS,
            minimap: {
              enabled: !showAnnotations,
              scale: 1,
              showSlider: "mouseover",
              maxColumn: 80,
            },
          }}
        />
      </div>
      {annotationLayer}
    </div>
  );
}
