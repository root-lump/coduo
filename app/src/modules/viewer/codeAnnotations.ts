import type { CodeAnnotation, CodeRange } from "../review";
import type { ChangedLine } from "../workspace";

/**
 * 注釈ブロックの先頭行の変更種別。カードはブロックの直上に出るので、この行の色を
 * カードの背景にも敷いて、行に付いた色がカードの位置で途切れないようにする。
 */
export function annotationChangeKind(
  annotation: CodeAnnotation,
  changedLines: ChangedLine[],
): ChangedLine["kind"] | undefined {
  const startLine = annotation.target.range?.startLine;
  if (startLine === undefined) return undefined;
  return changedLines.find((change) => change.line === startLine)?.kind;
}

export function containsCodePosition(
  range: CodeRange | undefined,
  lineNumber: number,
  column: number,
): boolean {
  if (!range || lineNumber < range.startLine || lineNumber > range.endLine)
    return false;
  if (range.startColumn === undefined || range.endColumn === undefined)
    return true;
  if (lineNumber === range.startLine && column < range.startColumn)
    return false;
  if (lineNumber === range.endLine && column > range.endColumn) return false;
  return true;
}

export function annotationAtPosition(
  annotations: CodeAnnotation[],
  lineNumber: number,
  column: number,
): CodeAnnotation | undefined {
  return annotations.find((annotation) =>
    containsCodePosition(annotation.target.range, lineNumber, column),
  );
}

/**
 * 開いたカードの高さの見積もり。zone の初期高さに使い、描画後は実測へ差し替える。
 * 既定では全部のカードが開いているので、畳んだ高さではなくこちらを初期値にする。
 */
export const ANNOTATION_CARD_HEIGHT = 120;
