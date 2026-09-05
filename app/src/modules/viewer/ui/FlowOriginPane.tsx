// 分割表示の上段。開いているジャンプの参照元のファイルを読み取り専用で出す。
// 親の範囲（ステップの対象か、1 つ上のジャンプの飛び先）の Tour の表示（フォーカス、
// 注釈、ジャンプの印）を下段と同じ経路（useMonacoViewer）で保ち、参照元の式を装飾して
// 中央に出す。
// コードナビゲーションの登録は Monaco 全体への単一登録なので、ここでは行わない
// （navigationFiles を空で渡すと登録されない。登録はグローバルなので上段でも効く）。
import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { editor } from "monaco-editor";
import type {
  CodeAnnotation,
  CodeJump,
  CodeRange,
  CodeTarget,
  JumpKind,
} from "../../review";
import type { ChangedLine, FileContent, FileReference } from "../../workspace";
import { languageFromPath } from "../language";
import { CODUO_THEME } from "../monacoEnvironment";
import {
  CodeAnnotationRail,
  shouldRenderCodeAnnotations,
  type AnnotationRail,
} from "./CodeAnnotationRail";
import { SHARED_EDITOR_OPTIONS } from "./editorOptions";
import { useMonacoViewer } from "./useMonacoViewer";

const NO_NAVIGATION_FILES: FileContent[] = [];
const ignoreLocation = () => undefined;

type FlowOriginPaneProps = {
  file: FileContent;
  /** 参照元の式。file 内の 1 行。 */
  from: CodeRange;
  kind: JumpKind;
  /** 親の範囲。フォーカス装飾を付ける。 */
  focus: CodeTarget;
  /** 親の範囲の注釈。 */
  annotations: CodeAnnotation[];
  /** 親の範囲のジャンプ。クリックで開くと、今見ている定義が置き換わる。 */
  jumps: CodeJump[];
  /** 変更行。上段のファイルが表示中ファイルと同じときだけ非空。 */
  changedLines: ChangedLine[];
  focusToken: number;
  onOpenJump(jump: CodeJump): void;
  /** 注釈レールの幅。下段と共有する。 */
  rail: AnnotationRail;
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  /** 連結線が座標を引くためにエディタ実体を渡す。unmount 時は undefined。 */
  onEditor(editorInstance: editor.ICodeEditor | undefined): void;
};

export function FlowOriginPane({
  file,
  from,
  kind,
  focus,
  annotations,
  jumps,
  changedLines,
  focusToken,
  onOpenJump,
  rail,
  resolveFileReference,
  onOpenFileReference,
  onEditor,
}: FlowOriginPaneProps) {
  const [dismissedFocusToken, setDismissedFocusToken] = useState<number>();
  // hook の効果は参照の同一性で再実行を決めるので、レンダーごとに作り直さない。
  const reveal = useMemo(
    () => ({ file: file.path, range: from }),
    [file.path, from],
  );
  const origin = useMemo(() => ({ from, kind }), [from, kind]);
  const {
    anchors,
    editorInstance,
    handleMount,
    selectAnnotation,
    selectedAnnotationId,
    viewport,
  } = useMonacoViewer({
    annotations,
    changedLines,
    filePath: file.path,
    focus,
    reveal,
    focusToken,
    navigationFiles: NO_NAVIGATION_FILES,
    symbolIndex: null,
    onOpenLocation: ignoreLocation,
    jumpTarget: undefined,
    jumpToken: 0,
    jumps,
    definitionAnchor: undefined,
    origin,
    onOpenJump,
  });

  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;
  useEffect(() => {
    onEditorRef.current(editorInstance);
  }, [editorInstance]);
  useEffect(() => () => onEditorRef.current(undefined), []);

  const showAnnotations = shouldRenderCodeAnnotations({
    annotationCount: annotations.length,
    dismissedFocusToken,
    focusToken,
    hasViewport: viewport.height > 0 && viewport.width > 0,
  });
  const className = [
    "code-viewer flow-pane flow-pane--origin",
    showAnnotations ? "has-code-annotations" : "",
    showAnnotations && rail.isNarrow ? "is-narrow-annotations" : "",
    rail.isResizing ? "is-resizing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = {
    "--annotation-rail-width": `${rail.width}px`,
  } as CSSProperties;

  return (
    <div className={className} style={style}>
      <div className="code-editor-surface">
        <Editor
          height="100%"
          // 下段と同じファイルを開くことがある。モデルを共有すると片方の unmount が
          // もう片方のモデルを破棄するので、上段専用の URI にする（差分エディタと同じ理由）。
          path={`file://coduo-flow-origin/${file.path}`}
          keepCurrentModel
          value={file.content}
          language={file.language || languageFromPath(file.path)}
          theme={CODUO_THEME}
          loading={
            <div className="viewer-loading">エディタを準備しています…</div>
          }
          onMount={handleMount}
          options={{
            ...SHARED_EDITOR_OPTIONS,
            minimap: { enabled: false },
            stickyScroll: { enabled: false },
            folding: false,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "none",
          }}
        />
      </div>
      {showAnnotations && (
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
      )}
    </div>
  );
}
