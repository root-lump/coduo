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

/**
 * 上段が中央に出す範囲。extent（定義から参照元まで）が収まればそれを、収まらなければ
 * 参照元（selection）だけを出す。収まらない範囲を中央に出すと両端とも画面外になり、
 * 線が 1 本も引けなくなるため。
 * 高さが 1 行にも満たないときは、段のレイアウトが確定していない（マウント直後の段は
 * 数 px しかない）とみなして extent を返す。確定後の出し直しでこの関数を呼び直せば
 * 正しく判定し直せるが、ここで selection に倒すと、その出し直しは selection が
 * 見えている時点で止まり、extent に戻らない。
 */
export function chooseRevealRange<
  T extends Pick<IRange, "startLineNumber" | "endLineNumber">,
>(
  extent: T,
  selection: T,
  viewportHeight: number,
  lineHeight: number,
): T {
  if (lineHeight > 0 && viewportHeight < lineHeight) return extent;
  return fitsInViewport(extent, viewportHeight, lineHeight) ? extent : selection;
}
