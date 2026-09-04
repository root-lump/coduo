// 分割表示の上段。from（どの式から来たか）のファイルを読み取り専用で出し、式を装飾する。
// コードナビゲーションの登録は Monaco 全体への単一登録なので、ここでは行わない（下段が持つ）。
import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import type { StepOrigin } from "../../review";
import type { FileContent } from "../../workspace";
import { originDecoration } from "../flowDecorations";
import { focusRange } from "../decorations";
import { languageFromPath } from "../language";
import { CODUO_THEME, monaco } from "../monacoEnvironment";
import { SHARED_EDITOR_OPTIONS } from "./editorOptions";
import { revealRangeInCenterSettled } from "./revealRange";

type FlowOriginPaneProps = {
  file: FileContent;
  origin: StepOrigin;
  /** 連結線が座標を引くためにエディタ実体を渡す。unmount 時は undefined。 */
  onEditor(editorInstance: editor.ICodeEditor | undefined): void;
};

export function FlowOriginPane({ file, origin, onEditor }: FlowOriginPaneProps) {
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
    decorationsRef.current?.set(originDecoration(origin, lineCount));
    const range = focusRange(origin, lineCount);
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

  // 同じファイルのまま from だけが変わったとき（同一ファイル内の踏み込み）に装飾を付け直す。
  useEffect(() => {
    if (editorRef.current) reveal(editorRef.current);
    // 装飾 ID はモデルごとに固有で、モデルが差し替わると collection からは二度と消せない
    // （keepCurrentModel で生き残る旧モデルに残り、同じファイルへ戻ると前回の式も光る）。
    // モデル差し替え（子の path 反映）より先に走るこの cleanup で必ず消しておく。
    return () => decorationsRef.current?.clear();
    // reveal は origin だけに依存する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

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
