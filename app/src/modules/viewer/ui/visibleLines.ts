/** Monaco の getVisibleRanges() が返す行範囲の形（Range の行だけを使う）。 */
export type VisibleLineRange = {
  startLineNumber: number;
  endLineNumber: number;
};

/** 行がいずれかの可視範囲に含まれるか。 */
export function lineIsVisible(
  ranges: readonly VisibleLineRange[],
  lineNumber: number,
): boolean {
  return ranges.some(
    (range) =>
      lineNumber >= range.startLineNumber && lineNumber <= range.endLineNumber,
  );
}
