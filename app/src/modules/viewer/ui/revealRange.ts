// エディタのマウント直後は、レイアウトが確定する前に reveal が走ることがあり、
// そのあとのレイアウト変更でスクロール位置が丸められて範囲が見えなくなる。
// reveal のあと短い間だけレイアウト変更を見張り、範囲が見えていなければ即時に出し直す。
import type { editor, IRange } from "monaco-editor";
import { monaco } from "../monacoEnvironment";

type Disposable = { dispose(): void };

/** レイアウト変更を見張る時間。マウント直後の自動レイアウトが落ち着くのに十分な長さ。 */
const WATCH_MS = 1500;

function isLineVisible(editorInstance: editor.ICodeEditor, line: number) {
  return editorInstance
    .getVisibleRanges()
    .some((r) => r.startLineNumber <= line && line <= r.endLineNumber);
}

export function revealRangeInCenterSettled(
  editorInstance: editor.ICodeEditor,
  range: IRange,
  scrollType: editor.ScrollType,
): Disposable {
  editorInstance.revealRangeInCenter(range, scrollType);
  const startedAt = performance.now();
  const listener = editorInstance.onDidLayoutChange(() => {
    if (performance.now() - startedAt > WATCH_MS) {
      listener.dispose();
      return;
    }
    if (!isLineVisible(editorInstance, range.startLineNumber)) {
      editorInstance.revealRangeInCenter(
        range,
        monaco.editor.ScrollType.Immediate,
      );
    }
  });
  return listener;
}
