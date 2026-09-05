// 分割表示の上段。開いているジャンプの参照元のファイルを読み取り専用で出し、式を装飾する。
// コードナビゲーションの登録は Monaco 全体への単一登録なので、ここでは行わない（下段が持つ）。
import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import type { CodeRange, JumpKind } from "../../review";
import type { FileContent } from "../../workspace";
import { originDecoration } from "../flowDecorations";
import { focusRange } from "../decorations";
import { languageFromPath } from "../language";
import { CODUO_THEME, monaco } from "../monacoEnvironment";
import { SHARED_EDITOR_OPTIONS } from "./editorOptions";
import { revealRangeInCenterSettled } from "./revealRange";

type FlowOriginPaneProps = {
  file: FileContent;
  /** 参照元の式。file 内の 1 行。 */
  from: CodeRange;
  kind: JumpKind;
  /** 連結線が座標を引くためにエディタ実体を渡す。unmount 時は undefined。 */
  onEditor(editorInstance: editor.ICodeEditor | undefined): void;
};

export function FlowOriginPane({
  file,
  from,
  kind,
  onEditor,
}: FlowOriginPaneProps) {
  const editorRef = useRef<editor.ICodeEditor | undefined>(undefined);
  const decorationsRef = useRef<
    editor.IEditorDecorationsCollection | undefined
  >(undefined);
  const revealRef = useRef<{ dispose(): void } | undefined>(undefined);
  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;

  const reveal = (editorInstance: editor.ICodeEditor) => {
    const model = editorInstance.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    decorationsRef.current?.set(originDecoration(from, kind, lineCount));
    const range = focusRange({ file: file.path, range: from }, lineCount);
    revealRef.current?.dispose();
    if (range) {
      revealRef.current = revealRangeInCenterSettled(
        editorInstance,
        range,
        monaco.editor.ScrollType.Immediate,
      );
    }
  };

  const handleMount: OnMount = (editorInstance) => {
    editorRef.current = editorInstance;
    decorationsRef.current = editorInstance.createDecorationsCollection();
    reveal(editorInstance);
    onEditorRef.current(editorInstance);
  };

  // 同じファイルのまま参照元だけが変わったとき（同一ファイル内のジャンプ）に装飾を付け直す。
  // ファイルが替わるときの旧モデルの装飾は Monaco が setModel 時に所有者単位で消す。
  useEffect(() => {
    if (editorRef.current) reveal(editorRef.current);
    // reveal は from と kind だけに依存する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, kind]);

  useEffect(
    () => () => {
      revealRef.current?.dispose();
      decorationsRef.current?.clear();
      onEditorRef.current(undefined);
    },
    [],
  );

  return (
    <Editor
      height="100%"
      // 下段と同じファイルを開くことがある。モデルを共有すると片方の unmount が
      // もう片方のモデルを破棄するので、上段専用の URI にする（差分エディタと同じ理由）。
      path={`file://coduo-flow-origin/${file.path}`}
      keepCurrentModel
      value={file.content}
      language={file.language || languageFromPath(file.path)}
      theme={CODUO_THEME}
      loading={<div className="viewer-loading">エディタを準備しています…</div>}
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
  );
}
