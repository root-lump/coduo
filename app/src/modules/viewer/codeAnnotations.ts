import type { CodeAnnotation, CodeRange } from "../review";

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
 * 畳んだ状態のカードの高さ。zone の初期高さに使い、描画後は実測へ差し替える
 * （viewer.css の .code-annotation-card.is-collapsed の高さと揃える）。
 */
export const COLLAPSED_ANNOTATION_CARD_HEIGHT = 34;
