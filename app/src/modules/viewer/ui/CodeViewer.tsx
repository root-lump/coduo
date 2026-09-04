// コードビューアの view。Monaco のライフサイクルは useMonacoViewer が持ち、
// ここでは placeholder / エディタ / 注釈レイヤの表示だけを組み立てる。
// Tour の from があるステップでは、呼び出し元（FlowOriginPane）を上段に足して 2 段にする。
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useState, type CSSProperties } from "react";
import type { editor } from "monaco-editor";
import { CodeAnnotationLayer } from "./CodeAnnotationLayer";
import type { CodeAnnotation, CodeTarget, StepOrigin } from "../../review";
import type { ChangedLine, FileContent, FileReference } from "../../workspace";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import { PanelResizeHandle } from "../../layout";
import type { ViewMode } from "../diffView";
import type { NextHop } from "../flowDecorations";
import { paneLabels } from "../flowLabels";
import { languageFromPath } from "../language";
import { unavailableMessageFor } from "../unavailableMessage";
import { CODUO_THEME } from "../monacoEnvironment";
import { SHARED_EDITOR_OPTIONS } from "./editorOptions";
import { FlowConnector } from "./FlowConnector";
import { FlowOriginPane } from "./FlowOriginPane";
import { useAnnotationRailSizing } from "./useAnnotationRailSizing";
import { useFlowConnector } from "./useFlowConnector";
import { useMonacoViewer } from "./useMonacoViewer";

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
  /** 注釈本文のインラインコードをファイル参照として解釈する。 */
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  jumpTarget?: CodeTarget;
  jumpToken: number;
  /** 差分モードで変更前後を左右に並べるか（false なら 1 画面に混ぜて出す）。 */
  renderSideBySide: boolean;
  viewMode: ViewMode;
  /** 今のステップの from。あれば呼び出し元を上段に出して 2 段にする。 */
  flowOrigin?: { origin: StepOrigin; file: FileContent };
  /** 次のステップの from が今のファイル内にあるとき、その式。クリックで進む印になる。 */
  nextHop?: NextHop;
  onAdvanceHop(): void;
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
  resolveFileReference,
  onOpenFileReference,
  jumpTarget,
  jumpToken,
  renderSideBySide,
  viewMode,
  flowOrigin,
  nextHop,
  onAdvanceHop,
}: CodeViewerProps) {
  const [dismissedFocusToken, setDismissedFocusToken] = useState<number>();
  // 注釈レールの幅とレイアウトの基準。分割表示では下段のペインを指す。
  const [viewerElement, setViewerElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [splitElement, setSplitElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [originEditor, setOriginEditor] = useState<
    editor.ICodeEditor | undefined
  >(undefined);
  const rail = useAnnotationRailSizing(viewerElement);
  const {
    anchors,
    editorInstance,
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
    nextHop,
    onAdvanceHop,
  });
  const connector = useFlowConnector({
    container: splitElement,
    topEditor: originEditor,
    bottomEditor: editorInstance,
    origin: flowOrigin?.origin,
    focus,
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
  const viewerClassName = [
    "code-viewer",
    showAnnotations ? "has-code-annotations" : "",
    showAnnotations && rail.isNarrow ? "is-narrow-annotations" : "",
    rail.isResizing ? "is-resizing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const viewerStyle = {
    "--annotation-rail-width": `${rail.width}px`,
  } as CSSProperties;
  const annotationLayer = showAnnotations ? (
    <>
      <PanelResizeHandle
        className="code-annotation-resize-handle"
        label="注釈パネルの横幅を調整"
        onResizeStart={rail.startResize}
      />
      <CodeAnnotationLayer
        anchors={anchors}
        annotations={annotations}
        height={viewport.height}
        onClose={() => setDismissedFocusToken(focusToken)}
        onSelect={(id) => selectAnnotation(id, true)}
        resolveFileReference={resolveFileReference}
        onOpenFileReference={onOpenFileReference}
        selectedId={selectedAnnotationId}
        width={viewport.width}
      />
    </>
  ) : null;

  // 差分モードでも注釈とフォーカス装飾は modified 側に付ける（useMonacoViewer）。
  // 変更行ガター装飾だけは Monaco の差分色と重なるため出さない。
  const editorElement =
    viewMode === "diff" && baseText !== undefined ? (
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
    ) : (
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
    );

  if (!flowOrigin) {
    return (
      <div
        className={viewerClassName}
        data-testid="code-viewer"
        ref={setViewerElement}
        style={viewerStyle}
      >
        <div className="code-editor-surface">{editorElement}</div>
        {annotationLayer}
      </div>
    );
  }

  const labels = paneLabels(flowOrigin.origin.kind);
  const kindClass = `flow-kind-${flowOrigin.origin.kind}`;
  return (
    <div
      className={`code-viewer-split ${kindClass}`}
      data-testid="code-viewer"
      ref={setSplitElement}
    >
      <div className="flow-pane-bar flow-pane-bar--origin">
        <span className="flow-pane-path">{flowOrigin.file.path}</span>
        <span className="flow-pane-role">{labels.top}</span>
      </div>
      <div className="flow-pane flow-pane--origin">
        <FlowOriginPane
          file={flowOrigin.file}
          origin={flowOrigin.origin}
          onEditor={setOriginEditor}
        />
      </div>
      <div className="flow-pane-bar flow-pane-bar--target">
        <span className="flow-pane-path">{file.path}</span>
        <span className="flow-pane-role">{labels.bottom}</span>
      </div>
      <div
        className={`${viewerClassName} flow-pane flow-pane--target`}
        ref={setViewerElement}
        style={viewerStyle}
      >
        <div className="code-editor-surface">{editorElement}</div>
        {annotationLayer}
      </div>
      <FlowConnector path={connector} />
    </div>
  );
}
