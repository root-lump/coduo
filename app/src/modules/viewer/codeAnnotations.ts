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

export const ANNOTATION_CARD_HEIGHT = 128;
export const ANNOTATION_CARD_GAP = 13;
export const ANNOTATION_RAIL_MARGIN = 18;
/** 選択中のカードは説明を全文表示するため、レイアウト上もこの高さを占有する。 */
export const EXPANDED_ANNOTATION_CARD_HEIGHT = 330;

export function layoutAnnotationCards(
  anchors: AnnotationAnchor[],
  viewportHeight: number,
  cardHeight = ANNOTATION_CARD_HEIGHT,
  gap = ANNOTATION_CARD_GAP,
  margin = ANNOTATION_RAIL_MARGIN,
  selectedId?: string,
  selectedHeight = cardHeight,
): AnnotationCardPlacement[] {
  if (anchors.length === 0) return [];
  const heightOf = (id: string) =>
    id === selectedId ? selectedHeight : cardHeight;
  const totalHeight =
    anchors.reduce((sum, anchor) => sum + heightOf(anchor.id), 0) +
    Math.max(anchors.length - 1, 0) * gap +
    margin * 2;
  const fits = totalHeight <= viewportHeight;
  const placements = anchors.map((anchor) => ({
    ...anchor,
    cardTop: Math.max(anchor.top - heightOf(anchor.id) / 2, margin),
  }));
  if (fits) {
    placements.forEach((placement) => {
      placement.cardTop = Math.min(
        placement.cardTop,
        Math.max(margin, viewportHeight - margin - heightOf(placement.id)),
      );
    });
  }
  for (let index = 1; index < placements.length; index += 1) {
    placements[index].cardTop = Math.max(
      placements[index].cardTop,
      placements[index - 1].cardTop + heightOf(placements[index - 1].id) + gap,
    );
  }
  // 収まりきる場合だけ画面内へ押し戻す。収まらない場合はレール側をスクロールさせる。
  if (fits) {
    const last = placements.at(-1)!;
    const overflow =
      last.cardTop + heightOf(last.id) - (viewportHeight - margin);
    if (overflow > 0) {
      placements.forEach((placement) => {
        placement.cardTop -= overflow;
      });
      for (let index = placements.length - 2; index >= 0; index -= 1) {
        placements[index].cardTop = Math.min(
          placements[index].cardTop,
          placements[index + 1].cardTop - heightOf(placements[index].id) - gap,
        );
      }
    }
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
