import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type UIEvent,
} from "react";
import type { CodeAnnotation } from "../../review";
import { TourMarkdown } from "../../review";
import type { FileReference } from "../../workspace";
import type { AnnotationAnchor } from "../codeAnnotations";
import {
  annotationRailHeight,
  annotationRailScrollTop,
  layoutAnnotationCards,
  ANNOTATION_CARD_HEIGHT,
  ANNOTATION_RAIL_MARGIN,
  EXPANDED_ANNOTATION_CARD_HEIGHT,
} from "../codeAnnotations";
import { useAnnotationCardHeights } from "./useAnnotationCardHeights";

type CodeAnnotationLayerProps = {
  anchors: AnnotationAnchor[];
  annotations: CodeAnnotation[];
  height: number;
  onClose(): void;
  onSelect(id: string): void;
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  selectedId?: string;
  width: number;
};

export function CodeAnnotationLayer({
  anchors,
  annotations,
  height,
  onClose,
  onSelect,
  resolveFileReference,
  onOpenFileReference,
  selectedId,
  width,
}: CodeAnnotationLayerProps) {
  const [railScrollTop, setRailScrollTop] = useState(0);
  const { contentRef, heights } = useAnnotationCardHeights(
    annotations.map((annotation) => annotation.id).join("\n"),
  );
  const placements = layoutAnnotationCards(anchors, {
    heightOf: (id) =>
      heights[id] ??
      (id === selectedId
        ? EXPANDED_ANNOTATION_CARD_HEIGHT
        : ANNOTATION_CARD_HEIGHT),
  });
  const placementById = new Map(
    placements.map((placement) => [placement.id, placement]),
  );
  const railHeight = annotationRailHeight(placements, height);
  const isScrollable = railHeight > height;
  const scrollTop = isScrollable ? railScrollTop : 0;
  const railRef = useRef<HTMLDivElement | null>(null);
  // エディタをスクロールするとアンカーが動くので、それを起点にレールを寄せる。
  // 手でレールをスクロールしている間はアンカーが動かず、追従が働かない。
  const anchorKey = anchors
    .map((anchor) => `${anchor.id}:${anchor.top}:${anchor.visible}`)
    .join("|");
  // 実測が入ると配置が変わるが、アンカーは動かない。高さの合計を依存に足して寄せ直す。
  const placedHeight = placements.reduce(
    (total, placement) => total + placement.cardHeight,
    0,
  );
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const next = annotationRailScrollTop(
      placements,
      height,
      railHeight,
      selectedId,
    );
    if (next === undefined || Math.abs(rail.scrollTop - next) < 1) return;
    // 代入で onScroll が飛び railScrollTop も揃う。依存に railScrollTop を含めない
    // ので、その state 更新でこの効果が再び走って往復することはない。
    rail.scrollTop = next;
  }, [anchorKey, placedHeight]);
  const lineStart = Math.max(width - 113, 90);
  // カード左端はエディタ面の右端から 23px（レールの右余白 15px とカードの内側余白）。
  const lineEnd = width + 23;

  return (
    <aside
      className="code-annotation-layer"
      aria-label="コード注釈"
      data-testid="code-annotation-layer"
    >
      <svg
        className="code-annotation-connectors"
        aria-hidden="true"
        width={width}
        height={height}
      >
        {annotations.map((annotation, index) => {
          const placement = placementById.get(annotation.id);
          if (!placement?.visible) return null;
          const cardCenter =
            placement.cardTop + placement.cardHeight / 2 - scrollTop;
          if (cardCenter < 0 || cardCenter > height) return null;
          return (
            <path
              className={`annotation-connector annotation-color-${(index % 4) + 1}${annotation.id === selectedId ? " is-selected" : ""}`}
              d={`M ${lineStart} ${placement.top} C ${lineStart + 28} ${placement.top}, ${lineEnd - 28} ${cardCenter}, ${lineEnd} ${cardCenter}`}
              key={annotation.id}
            />
          );
        })}
      </svg>
      <button
        className="code-annotation-close"
        type="button"
        onClick={onClose}
        aria-label="コード注釈を隠す"
        title="このステップでは注釈を隠す"
      >
        ×
      </button>
      <div
        className={`code-annotation-rail${isScrollable ? " is-scrollable" : ""}`}
        ref={railRef}
        onScroll={(event: UIEvent<HTMLDivElement>) => {
          if (isScrollable) setRailScrollTop(event.currentTarget.scrollTop);
        }}
      >
        <div
          className="code-annotation-rail-content"
          ref={contentRef}
          style={{ height: `${railHeight}px` }}
        >
          {annotations.map((annotation, index) => {
            const placement = placementById.get(annotation.id);
            const selected = annotation.id === selectedId;
            const offscreen = !placement?.visible;
            const style = {
              top: `${placement?.cardTop ?? ANNOTATION_RAIL_MARGIN}px`,
            } satisfies CSSProperties;
            // 本文の Markdown にファイルリンク（button）が入るため、カード全体を
            // button にせず、番号と見出しの button で選択とキーボード操作を受ける。
            // カード本体の click は補助で、リンク側は stopPropagation で切り分ける。
            return (
              <div
                className={`code-annotation-card annotation-color-${(index % 4) + 1}${selected ? " is-selected" : ""}${offscreen ? " is-offscreen" : ""}`}
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
                  {offscreen && (
                    <span
                      className="code-annotation-offscreen"
                      aria-hidden="true"
                    >
                      ↕
                    </span>
                  )}
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
      </div>
    </aside>
  );
}
