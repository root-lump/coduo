import type { CodeAnnotation, CodeRange } from "../review";

export type AnnotationAnchor = {
  id: string;
  top: number;
  visible: boolean;
};

export type AnnotationCardPlacement = AnnotationAnchor & {
  cardTop: number;
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

/** 見出しの 2 行目（22px）まで含めた通常カードの高さ。viewer.css の max-height と揃える。 */
export const ANNOTATION_CARD_HEIGHT = 150;
export const ANNOTATION_CARD_GAP = 13;
export const ANNOTATION_RAIL_MARGIN = 18;
/** 選択中のカードは説明を全文表示するため、レイアウト上もこの高さを占有する。 */
export const EXPANDED_ANNOTATION_CARD_HEIGHT = 330;

/**
 * カードはアンカーの行の高さに合わせて置き、順序と間隔だけを保つ。表示領域の下端に
 * 押し戻すことはしない（押し戻すと、低いペインではスクロールに追従しなくなる）。
 * 下にはみ出した分はレール側のスクロールで見せる。
 */
export function layoutAnnotationCards(
  anchors: AnnotationAnchor[],
  cardHeight = ANNOTATION_CARD_HEIGHT,
  gap = ANNOTATION_CARD_GAP,
  margin = ANNOTATION_RAIL_MARGIN,
  selectedId?: string,
  selectedHeight = cardHeight,
): AnnotationCardPlacement[] {
  if (anchors.length === 0) return [];
  const heightOf = (id: string) =>
    id === selectedId ? selectedHeight : cardHeight;
  const placements = anchors.map((anchor) => ({
    ...anchor,
    cardTop: Math.max(anchor.top - heightOf(anchor.id) / 2, margin),
  }));
  for (let index = 1; index < placements.length; index += 1) {
    placements[index].cardTop = Math.max(
      placements[index].cardTop,
      placements[index - 1].cardTop + heightOf(placements[index - 1].id) + gap,
    );
  }
  return placements;
}

export function annotationRailHeight(
  placements: AnnotationCardPlacement[],
  viewportHeight: number,
  cardHeight = ANNOTATION_CARD_HEIGHT,
  margin = ANNOTATION_RAIL_MARGIN,
  selectedId?: string,
  selectedHeight = cardHeight,
): number {
  const last = placements.at(-1);
  if (!last) return viewportHeight;
  const lastHeight = last.id === selectedId ? selectedHeight : cardHeight;
  return Math.max(viewportHeight, last.cardTop + lastHeight + margin);
}

/**
 * 注釈のアンカー（コード側の線の起点）。行が可視範囲に無いときは表示領域の上端か
 * 下端に寄せ、visible を false にする（線は引かず、カードは画面外の見た目になる）。
 * Monaco の getScrolledVisiblePosition は画面外の行にも非 null の位置を返すので、
 * 可視かどうかは別に渡す visibleRanges で判定する。
 */
export function annotationAnchor(args: {
  id: string;
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
  if (visible && position) {
    const center = position.top + position.height / 2;
    return { id, top: Math.min(Math.max(center, 0), viewportHeight), visible: true };
  }
  const firstVisibleLine = visibleRanges[0]?.startLineNumber ?? 1;
  return {
    id,
    top: lineNumber < firstVisibleLine ? 4 : viewportHeight - 4,
    visible: false,
  };
}
