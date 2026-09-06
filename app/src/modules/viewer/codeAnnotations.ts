import type { CodeAnnotation, CodeRange } from "../review";

export type AnnotationAnchor = {
  id: string;
  top: number;
  visible: boolean;
};

export type AnnotationCardPlacement = AnnotationAnchor & {
  cardTop: number;
  cardHeight: number;
};

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
 * カードの高さの初期見積もり。実際の高さは内容で決まるため、描画後は実測値で置き換える
 * （viewer.css の .code-annotation-card の min-height と揃える）。
 */
export const ANNOTATION_CARD_HEIGHT = 137;
export const ANNOTATION_CARD_GAP = 13;
/** アンカー（ブロックの下端）とカード上端の間隔。 */
export const ANNOTATION_CARD_OFFSET = 6;

export type AnnotationLayoutOptions = {
  /** カードの実測高さ。実測が入るまでは見積もりを返す。 */
  heightOf(id: string): number;
  gap?: number;
  offset?: number;
};

/**
 * カードは注釈のブロックの直下に置き、順序と間隔だけを保つ。表示領域に押し戻すことは
 * しない（押し戻すと、どのブロックに付いた注釈かが分からなくなる）。
 */
export function layoutAnnotationCards(
  anchors: AnnotationAnchor[],
  {
    heightOf,
    gap = ANNOTATION_CARD_GAP,
    offset = ANNOTATION_CARD_OFFSET,
  }: AnnotationLayoutOptions,
): AnnotationCardPlacement[] {
  const placements = anchors.map((anchor) => ({
    ...anchor,
    cardHeight: heightOf(anchor.id),
    cardTop: anchor.top + offset,
  }));
  for (let index = 1; index < placements.length; index += 1) {
    const previous = placements[index - 1];
    placements[index].cardTop = Math.max(
      placements[index].cardTop,
      previous.cardTop + previous.cardHeight + gap,
    );
  }
  return placements;
}

/**
 * 注釈のアンカー（カードを吊るすブロックの下端）。ブロックの終了行が可視範囲に無い
 * ときは visible を false にし、カードは描画しない（重ねる表示では画面外のカードを
 * 寄せる先が無く、行と対応しない位置にカードだけが残ってしまう）。
 * Monaco の getScrolledVisiblePosition は画面外の行にも非 null の位置を返すので、
 * 可視かどうかは別に渡す visibleRanges で判定する。
 */
export function annotationAnchor(args: {
  id: string;
  /** ブロックの終了行。カードはこの行の下に出る。 */
  lineNumber: number;
  visibleRanges: readonly { startLineNumber: number; endLineNumber: number }[];
  position: { top: number; height: number } | null;
  viewportHeight: number;
}): AnnotationAnchor {
  const { id, lineNumber, visibleRanges, position, viewportHeight } = args;
  const visible =
    position !== null &&
    visibleRanges.some(
      (range) =>
        lineNumber >= range.startLineNumber &&
        lineNumber <= range.endLineNumber,
    );
  if (!visible || !position) return { id, top: 0, visible: false };
  const bottom = position.top + position.height;
  return {
    id,
    top: Math.min(Math.max(bottom, 0), viewportHeight),
    visible: true,
  };
}
