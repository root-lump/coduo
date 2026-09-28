import type { IRange } from "monaco-editor";
import type { CodeRange } from "../../review";
import type { SymbolLocation } from "../codeNavigation";

/**
 * 上段がスクロールで画面に出す範囲。
 * 中段は「この段の定義（anchor）」と「次の段を開いた参照元の式（from）」の両方を持つ。
 * from だけを中央に出すと定義の行が画面外に出ることがあり、連結線は可視行にしか
 * 引かない（useFlowConnector）ので、上の段からこの段への線が消える。両方を含む範囲にする。
 */
export function originRevealRange(
  from: CodeRange,
  anchor: SymbolLocation | undefined,
): CodeRange {
  if (!anchor) return from;
  const anchorRange: CodeRange = {
    startLine: anchor.lineNumber,
    startColumn: anchor.startColumn,
    endLine: anchor.lineNumber,
    endColumn: anchor.endColumn,
  };
  const [first, last] =
    anchorRange.startLine <= from.startLine
      ? [anchorRange, from]
      : [from, anchorRange];
  return {
    startLine: first.startLine,
    startColumn: first.startColumn,
    endLine: last.endLine,
    endColumn: last.endColumn,
  };
}

/**
 * 行範囲がペインの高さに収まるか。
 * Monaco の Center 系 reveal は範囲の中点を中央に置くだけで、収まらない範囲は両端とも
 * 画面外に出る。高さが取れない（マウント直後で 0）ときは収まらない扱いにする。
 */
export function fitsInViewport(
  range: Pick<IRange, "startLineNumber" | "endLineNumber">,
  viewportHeight: number,
  lineHeight: number,
): boolean {
  if (lineHeight <= 0) return false;
  const visibleLines = Math.floor(viewportHeight / lineHeight);
  return range.endLineNumber - range.startLineNumber + 1 <= visibleLines;
}
