// 注釈カードの描画。カードは Monaco の view zone（行間の空き）へ portal で入れる。
// 出す・出さないの判定（shouldRenderCodeAnnotations）は呼び出し側が行う。
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CodeAnnotation } from "../../review";
import { TourMarkdown } from "../../review";
import type { FileReference } from "../../workspace";
import type { AnnotationViewZone } from "./useAnnotationViewZones";

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
  annotations: CodeAnnotation[];
  /** 注釈ごとの view zone。中身をここへ描く。 */
  zones: AnnotationViewZone[];
  /** カードの実測高さを zone へ返す。 */
  onMeasure(annotationId: string, height: number): void;
  onClose(): void;
  onSelect(id: string): void;
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  selectedId?: string;
};

export function CodeAnnotationLayer({
  annotations,
  zones,
  onMeasure,
  onClose,
  onSelect,
  resolveFileReference,
  onOpenFileReference,
  selectedId,
}: CodeAnnotationLayerProps) {
  const zoneByAnnotationId = new Map(
    zones.map((zone) => [zone.annotationId, zone]),
  );

  return (
    <>
      <button
        className="code-annotation-close"
        type="button"
        onClick={onClose}
        aria-label="コード注釈を隠す"
        title="このステップでは注釈を隠す"
      >
        ×
      </button>
      {annotations.map((annotation, index) => {
        const zone = zoneByAnnotationId.get(annotation.id);
        if (!zone) return null;
        return createPortal(
          <AnnotationCard
            annotation={annotation}
            index={index}
            selected={annotation.id === selectedId}
            onMeasure={onMeasure}
            onSelect={onSelect}
            resolveFileReference={resolveFileReference}
            onOpenFileReference={onOpenFileReference}
          />,
          zone.domNode,
          annotation.id,
        );
      })}
    </>
  );
}

type AnnotationCardProps = {
  annotation: CodeAnnotation;
  index: number;
  selected: boolean;
  onMeasure(annotationId: string, height: number): void;
  onSelect(id: string): void;
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
};

function AnnotationCard({
  annotation,
  index,
  selected,
  onMeasure,
  onSelect,
  resolveFileReference,
  onOpenFileReference,
}: AnnotationCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;

  // zone の高さはカードの実測に合わせる。効果の実行時点では Monaco が zone の
  // domNode をまだ繋いでおらず高さが 0 になることがあるので、次のフレームで測り、
  // 以後は ResizeObserver で追う。反映は 1px 未満の差では行わない（zone の高さを
  // 変えると Monaco がレイアウトをやり直すため、微差で往復させない）。
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let frame: number | undefined;
    const measure = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        onMeasureRef.current(annotation.id, card.offsetHeight);
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [annotation.id, selected]);

  // 本文の Markdown にファイルリンク（button）が入るため、カード全体を button に
  // せず、番号と見出しの button で選択とキーボード操作を受ける。カード本体の click
  // は補助で、リンク側は stopPropagation で切り分ける。
  return (
    <div
      className={`code-annotation-card annotation-color-${(index % 4) + 1}${selected ? " is-selected" : " is-collapsed"}`}
      data-annotation-id={annotation.id}
      data-testid="code-annotation-card"
      onClick={() => onSelect(annotation.id)}
      ref={cardRef}
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
      {selected && (
        <TourMarkdown
          className="code-annotation-body"
          text={annotation.explanation}
          resolveFileReference={resolveFileReference}
          onOpenFileReference={onOpenFileReference}
        />
      )}
    </div>
  );
}
