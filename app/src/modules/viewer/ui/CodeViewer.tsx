// コードビューアの view。Monaco のライフサイクルは useMonacoViewer が持ち、
// ここでは placeholder / エディタ / 注釈レイヤの表示だけを組み立てる。
// ジャンプを開いているときは、参照元（FlowOriginPane）を上段に足して 2 段にする。
import Editor, { DiffEditor } from "@monaco-editor/react";
import { useState, type CSSProperties } from "react";
import type { editor } from "monaco-editor";
import type {
  CodeAnnotation,
  CodeJump,
  CodeRange,
  CodeTarget,
  JumpKind,
} from "../../review";
import type { ChangedLine, FileContent, FileReference } from "../../workspace";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import type { SymbolLocation } from "../codeNavigation";
import type { ViewMode } from "../diffView";
import { PANE_LABELS } from "../flowLabels";
import { languageFromPath } from "../language";
import { unavailableMessageFor } from "../unavailableMessage";
import { CODUO_THEME } from "../monacoEnvironment";
import {
  CodeAnnotationRail,
  shouldRenderCodeAnnotations,
} from "./CodeAnnotationRail";
import { SHARED_EDITOR_OPTIONS } from "./editorOptions";
import { FlowConnector } from "./FlowConnector";
import { FlowOriginPane } from "./FlowOriginPane";
import { JumpPathBar } from "./JumpPathBar";
import { useAnnotationRailSizing } from "./useAnnotationRailSizing";
import { useFlowConnector } from "./useFlowConnector";
import { useMonacoViewer } from "./useMonacoViewer";

/** 開いているジャンプの表示に要るもの。無ければ 1 面表示。 */
export type JumpView = {
  /** 開いているジャンプの列。末尾が今見ている定義。 */
  path: CodeJump[];
  /** 上段に出す参照元のファイル（末尾のジャンプの from があるファイル）。 */
  originFile: FileContent;
  from: CodeRange;
  kind: JumpKind;
  /** 上段に保つ親の範囲（ステップの対象か、1 つ上のジャンプの飛び先）。 */
  originFocus: CodeTarget;
  originAnnotations: CodeAnnotation[];
  originJumps: CodeJump[];
  /** 上段の変更行。上段のファイルが表示中ファイルと同じときだけ非空。 */
  originChangedLines: ChangedLine[];
  /** 下段の定義の識別子。線の終点。 */
  anchor?: SymbolLocation;
  /** パンくずの先頭（ステップの対象ファイルの表示名）。 */
  rootLabel: string;
};

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
  /** 今いる範囲のジャンプ（file 内の式）。クリックで定義へ飛ぶ印を出す。 */
  jumps: CodeJump[];
  onOpenJump(jump: CodeJump): void;
  jumpView?: JumpView;
  /** 上段（親の範囲）のジャンプを開く。今見ている定義がそれに置き換わる。 */
  onOpenOriginJump(jump: CodeJump): void;
  onJumpBack(depth: number): void;
};

export { shouldRenderCodeAnnotations };

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
  jumps,
  onOpenJump,
  jumpView,
  onOpenOriginJump,
  onJumpBack,
}: CodeViewerProps) {
  const [dismissedFocusToken, setDismissedFocusToken] = useState<number>();
  // 注釈レールの幅とレイアウトの基準。分割表示では下段のペインを指す。
  const [viewerElement, setViewerElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(
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
    jumps,
    definitionAnchor: jumpView?.anchor,
    onOpenJump,
  });
  const connector = useFlowConnector({
    container: shellElement,
    topEditor: originEditor,
    bottomEditor: editorInstance,
    from: jumpView?.from,
    kind: jumpView?.kind,
    anchor: jumpView?.anchor,
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
    jumpView ? "flow-pane flow-pane--target" : "",
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
    <CodeAnnotationRail
      anchors={anchors}
      annotations={annotations}
      viewport={viewport}
      selectedId={selectedAnnotationId}
      onSelect={(id) => selectAnnotation(id, true)}
      onClose={() => setDismissedFocusToken(focusToken)}
      onResizeStart={rail.startResize}
      resolveFileReference={resolveFileReference}
      onOpenFileReference={onOpenFileReference}
    />
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

  // 下段（本体のエディタ）は 1 面でも 2 段でも同じ key の同じ要素にして、
  // ジャンプの開閉で Monaco を作り直さない（位置が変わると React は要素を捨てる）。
  const targetPane = (
    <div
      key="target"
      className={viewerClassName}
      ref={setViewerElement}
      style={viewerStyle}
    >
      <div className="code-editor-surface">{editorElement}</div>
      {annotationLayer}
    </div>
  );

  if (!jumpView) {
    return (
      <div
        className="code-viewer-shell"
        data-testid="code-viewer"
        ref={setShellElement}
      >
        {targetPane}
      </div>
    );
  }

  return (
    <div
      className={`code-viewer-shell code-viewer-split flow-kind-${jumpView.kind}`}
      data-testid="code-viewer"
      ref={setShellElement}
    >
      <JumpPathBar
        key="path"
        rootLabel={jumpView.rootLabel}
        path={jumpView.path}
        onJumpBack={onJumpBack}
      />
      <div key="origin-bar" className="flow-pane-bar flow-pane-bar--origin">
        <span className="flow-pane-path">{jumpView.originFile.path}</span>
        <span className="flow-pane-role">{PANE_LABELS.top}</span>
      </div>
      <FlowOriginPane
        key="origin"
        file={jumpView.originFile}
        from={jumpView.from}
        kind={jumpView.kind}
        focus={jumpView.originFocus}
        annotations={jumpView.originAnnotations}
        jumps={jumpView.originJumps}
        changedLines={jumpView.originChangedLines}
        focusToken={focusToken}
        onOpenJump={onOpenOriginJump}
        rail={rail}
        resolveFileReference={resolveFileReference}
        onOpenFileReference={onOpenFileReference}
        onEditor={setOriginEditor}
      />
      <div key="target-bar" className="flow-pane-bar flow-pane-bar--target">
        <span className="flow-pane-path">{file.path}</span>
        <span className="flow-pane-role">{PANE_LABELS.bottom}</span>
      </div>
      {targetPane}
      <FlowConnector key="connector" path={connector} />
    </div>
  );
}
