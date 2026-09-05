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
export const ANNOTATION_RAIL_MARGIN = 18;
/** 選択中のカードの初期見積もり。viewer.css の .is-selected の max-height と揃える。 */
export const EXPANDED_ANNOTATION_CARD_HEIGHT = 330;

export type AnnotationLayoutOptions = {
  /** カードの実測高さ。実測が入るまでは見積もりを返す。 */
  heightOf(id: string): number;
  gap?: number;
  margin?: number;
};

/**
 * カードはアンカーの行の高さに合わせて置き、順序と間隔だけを保つ。表示領域の下端に
 * 押し戻すことはしない（押し戻すと、低いペインではスクロールに追従しなくなる）。
 * 下にはみ出した分はレール側のスクロールで見せる。
 */
export function layoutAnnotationCards(
  anchors: AnnotationAnchor[],
  {
    heightOf,
    gap = ANNOTATION_CARD_GAP,
    margin = ANNOTATION_RAIL_MARGIN,
  }: AnnotationLayoutOptions,
): AnnotationCardPlacement[] {
  const placements = anchors.map((anchor) => {
    const cardHeight = heightOf(anchor.id);
    return {
      ...anchor,
      cardHeight,
      cardTop: Math.max(anchor.top - cardHeight / 2, margin),
    };
  });
  for (let index = 1; index < placements.length; index += 1) {
    const previous = placements[index - 1];
    placements[index].cardTop = Math.max(
      placements[index].cardTop,
      previous.cardTop + previous.cardHeight + gap,
    );
  }
  return placements;
}

export function annotationRailHeight(
  placements: AnnotationCardPlacement[],
  viewportHeight: number,
  margin = ANNOTATION_RAIL_MARGIN,
): number {
  const last = placements.at(-1);
  if (!last) return viewportHeight;
  return Math.max(viewportHeight, last.cardTop + last.cardHeight + margin);
}

/**
 * エディタのスクロールに合わせてレールを寄せる位置。基準にするカード（選択中のもの、
 * 無ければアンカーが可視な先頭のもの）が表示領域の上端に来る位置を返す。
 * 可視なアンカーが 1 つも無ければ undefined を返し、呼び出し側は寄せない。
 */
export function annotationRailScrollTop(
  placements: AnnotationCardPlacement[],
  viewportHeight: number,
  railHeight: number,
  selectedId?: string,
  margin = ANNOTATION_RAIL_MARGIN,
): number | undefined {
  const base =
    placements.find((placement) => placement.id === selectedId) ??
    placements.find((placement) => placement.visible);
  if (!base) return undefined;
  const maxScrollTop = Math.max(railHeight - viewportHeight, 0);
  return Math.min(Math.max(base.cardTop - margin, 0), maxScrollTop);
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
