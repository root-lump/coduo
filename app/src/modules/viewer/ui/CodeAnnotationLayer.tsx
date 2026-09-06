// 注釈カードのレイヤ。カードは対象ブロックの直下へ、コードに重ねて置く。
// 出す・出さないの判定（shouldRenderCodeAnnotations）は呼び出し側が行う。
import type { CSSProperties } from "react";
import type { CodeAnnotation } from "../../review";
import { TourMarkdown } from "../../review";
import type { FileReference } from "../../workspace";
import type { AnnotationAnchor } from "../codeAnnotations";
import {
  layoutAnnotationCards,
  ANNOTATION_CARD_HEIGHT,
} from "../codeAnnotations";
import { useAnnotationCardHeights } from "./useAnnotationCardHeights";

type AnnotationRenderState = {
  annotationCount: number;
  dismissedFocusToken?: number;
  focusToken: number;
  hasViewport: boolean;
};

export function shouldRenderCodeAnnotations({
  annotationCount,
  dismissedFocusToken,
  focusToken,
  hasViewport,
}: AnnotationRenderState): boolean {
  return (
    annotationCount > 0 && hasViewport && dismissedFocusToken !== focusToken
  );
}

type CodeAnnotationLayerProps = {
  anchors: AnnotationAnchor[];
  annotations: CodeAnnotation[];
  /** カードの左端。エディタのコンテンツ左端（行番号ガターの右）に揃える。 */
  contentLeft: number;
  onClose(): void;
  onSelect(id: string): void;
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  selectedId?: string;
};

export function CodeAnnotationLayer({
  anchors,
  annotations,
  contentLeft,
  onClose,
  onSelect,
  resolveFileReference,
  onOpenFileReference,
  selectedId,
}: CodeAnnotationLayerProps) {
  const { contentRef, heights } = useAnnotationCardHeights(
    annotations.map((annotation) => annotation.id).join("\n"),
  );
  // アンカーが見えていないカードは描かない。押し下げの計算にも入れない
  // （画面外のブロックのカードが、見えているブロックのカードを押し下げてしまう）。
  const visibleAnchors = anchors.filter((anchor) => anchor.visible);
  const placements = layoutAnnotationCards(visibleAnchors, {
    heightOf: (id) => heights[id] ?? ANNOTATION_CARD_HEIGHT,
  });
  const placementById = new Map(
    placements.map((placement) => [placement.id, placement]),
  );

  return (
    <aside
      className="code-annotation-layer"
      aria-label="コード注釈"
      data-testid="code-annotation-layer"
    >
      <button
        className="code-annotation-close"
        type="button"
        onClick={onClose}
        aria-label="コード注釈を隠す"
        title="このステップでは注釈を隠す"
      >
        ×
      </button>
      <div className="code-annotation-cards" ref={contentRef}>
        {annotations.map((annotation, index) => {
          const placement = placementById.get(annotation.id);
          if (!placement) return null;
          const selected = annotation.id === selectedId;
          const style = {
            top: `${placement.cardTop}px`,
            left: `${contentLeft}px`,
          } satisfies CSSProperties;
          // 本文の Markdown にファイルリンク（button）が入るため、カード全体を
          // button にせず、番号と見出しの button で選択とキーボード操作を受ける。
          // カード本体の click は補助で、リンク側は stopPropagation で切り分ける。
          return (
            <div
              className={`code-annotation-card annotation-color-${(index % 4) + 1}${selected ? " is-selected" : ""}`}
              data-annotation-id={annotation.id}
              data-testid="code-annotation-card"
              key={annotation.id}
              onClick={() => onSelect(annotation.id)}
              style={style}
            >
              <button
                aria-label={`${index + 1}. ${annotation.label}のコードを表示`}
                aria-pressed={selected}
                className="code-annotation-select"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(annotation.id);
                }}
                type="button"
              >
                <span className="code-annotation-number">{index + 1}</span>
                <strong>{annotation.label}</strong>
              </button>
              <TourMarkdown
                className="code-annotation-body"
                text={annotation.explanation}
                resolveFileReference={resolveFileReference}
                onOpenFileReference={onOpenFileReference}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
