// エディタのマウント直後や分割表示への切り替え直後は、レイアウトが確定する前に reveal が
// 走ることがあり、そのあとのレイアウト変更でスクロール位置が丸められて範囲が端へ寄る。
// reveal のあと短い間だけ、レイアウト変更と時間経過の両方で位置を確かめ、
// 範囲が表示範囲の中ほどに無ければ即時に出し直す。
import type { editor, IRange } from "monaco-editor";
import { monaco } from "../monacoEnvironment";

type Disposable = { dispose(): void };

/** レイアウト変更を見張る時間。マウント直後の自動レイアウトが落ち着くのに十分な長さ。 */
const WATCH_MS = 1500;
/** 時間経過で確かめるタイミング。自動レイアウト（ResizeObserver）と smooth scroll の後。 */
const CHECK_DELAYS_MS = [250, 700];
/** 出し直しの上限。レイアウト変更が連鎖しても有限で止める。 */
const MAX_REVEALS = 4;

/**
 * 行が表示範囲の中ほどにあるか。端に掛かっているだけの行は「見えていない」扱いにする。
 * 分割表示への切り替えでエディタが縮むと、中央に出したはずの行が端へ寄るため。
 */
function isLineSettled(editorInstance: editor.ICodeEditor, line: number) {
  return editorInstance.getVisibleRanges().some((r) => {
    const margin = Math.floor((r.endLineNumber - r.startLineNumber) * 0.25);
    return r.startLineNumber + margin <= line && line <= r.endLineNumber - margin;
  });
}

/**
 * 範囲を中央に出し、レイアウトが落ち着くまで位置を保つ。
 * 出す範囲はエディタの大きさで変わりうる（収まるかで出す範囲を選ぶ呼び出し元がある）ので、
 * 固定の範囲ではなく resolveRange を受け取り、初回と出し直しのたびにそのときの
 * エディタで範囲を決め直す。
 */
export function revealRangeInCenterSettled(
  editorInstance: editor.ICodeEditor,
  resolveRange: (editorInstance: editor.ICodeEditor) => IRange,
  scrollType: editor.ScrollType,
): Disposable {
  editorInstance.revealRangeInCenter(resolveRange(editorInstance), scrollType);
  const startedAt = performance.now();
  let reveals = 0;
  let done = false;
  const finish = () => {
    done = true;
    listener.dispose();
  };
  const check = () => {
    if (done) return;
    if (performance.now() - startedAt > WATCH_MS || reveals >= MAX_REVEALS) {
      finish();
      return;
    }
    const range = resolveRange(editorInstance);
    if (isLineSettled(editorInstance, range.startLineNumber)) return;
    // ファイル末尾付近など中央に出せない範囲は、出し直してもスクロール位置が変わらない。
    // その場合はこれ以上やることが無いので打ち切る（reveal がレイアウト変更を誘発しても
    // ループしない）。
    const before = editorInstance.getScrollTop();
    reveals += 1;
    editorInstance.revealRangeInCenter(range, monaco.editor.ScrollType.Immediate);
    if (editorInstance.getScrollTop() === before) finish();
  };
  const listener = editorInstance.onDidLayoutChange(check);
  const timers = CHECK_DELAYS_MS.map((delay) => window.setTimeout(check, delay));
  return {
    dispose() {
      finish();
      timers.forEach((timer) => window.clearTimeout(timer));
    },
  };
}
