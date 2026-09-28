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
