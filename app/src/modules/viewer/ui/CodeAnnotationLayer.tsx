import { useState, type CSSProperties, type UIEvent } from "react";
import type { CodeAnnotation } from "../../review";
import type { AnnotationAnchor } from "../codeAnnotations";
import {
  annotationRailHeight,
  layoutAnnotationCards,
  ANNOTATION_CARD_GAP,
  ANNOTATION_CARD_HEIGHT,
  ANNOTATION_RAIL_MARGIN,
  EXPANDED_ANNOTATION_CARD_HEIGHT,
} from "../codeAnnotations";

type CodeAnnotationLayerProps = {
  anchors: AnnotationAnchor[];
  annotations: CodeAnnotation[];
  height: number;
  onClose(): void;
  onSelect(id: string): void;
  selectedId?: string;
  width: number;
};

export function CodeAnnotationLayer({
  anchors,
  annotations,
  height,
  onClose,
  onSelect,
  selectedId,
  width,
}: CodeAnnotationLayerProps) {
  const [railScrollTop, setRailScrollTop] = useState(0);
  const placements = layoutAnnotationCards(
    anchors,
    height,
    ANNOTATION_CARD_HEIGHT,
    ANNOTATION_CARD_GAP,
    ANNOTATION_RAIL_MARGIN,
    selectedId,
    EXPANDED_ANNOTATION_CARD_HEIGHT,
  );
  const placementById = new Map(
    placements.map((placement) => [placement.id, placement]),
  );
  const railHeight = annotationRailHeight(
    placements,
    height,
    ANNOTATION_CARD_HEIGHT,
    ANNOTATION_RAIL_MARGIN,
    selectedId,
    EXPANDED_ANNOTATION_CARD_HEIGHT,
  );
  const isScrollable = railHeight > height;
  const scrollTop = isScrollable ? railScrollTop : 0;
  const lineStart = Math.max(width - 113, 90);
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
            placement.cardTop + ANNOTATION_CARD_HEIGHT / 2 - scrollTop;
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
        onScroll={(event: UIEvent<HTMLDivElement>) => {
          if (isScrollable) setRailScrollTop(event.currentTarget.scrollTop);
        }}
      >
        <div
          className="code-annotation-rail-content"
          style={{ height: `${railHeight}px` }}
        >
          {annotations.map((annotation, index) => {
            const placement = placementById.get(annotation.id);
            const selected = annotation.id === selectedId;
            const offscreen = !placement?.visible;
            const style = {
              top: `${placement?.cardTop ?? ANNOTATION_RAIL_MARGIN}px`,
            } satisfies CSSProperties;
            return (
              <button
                aria-label={`${index + 1}. ${annotation.label}のコードを表示`}
                aria-pressed={selected}
                className={`code-annotation-card annotation-color-${(index % 4) + 1}${selected ? " is-selected" : ""}${offscreen ? " is-offscreen" : ""}`}
                key={annotation.id}
                onClick={() => onSelect(annotation.id)}
                style={style}
                type="button"
              >
                <span className="code-annotation-number">{index + 1}</span>
                <span className="code-annotation-copy">
                  <strong>{annotation.label}</strong>
                  <span>{annotation.explanation}</span>
                </span>
                {offscreen && (
                  <span
                    className="code-annotation-offscreen"
                    aria-hidden="true"
                  >
                    ↕
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
