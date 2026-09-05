// 注釈レール（幅を変えるハンドルと注釈カードのレイヤ）。
// 1 面表示・分割表示の下段（CodeViewer）と上段（FlowOriginPane）で共用する。
// 出す・出さないの判定（shouldRenderCodeAnnotations）は呼び出し側が行う。
import { CodeAnnotationLayer } from "./CodeAnnotationLayer";
import type { CodeAnnotation } from "../../review";
import type { FileReference } from "../../workspace";
import { PanelResizeHandle } from "../../layout";
import type { AnnotationAnchor } from "../codeAnnotations";
import type { useAnnotationRailSizing } from "./useAnnotationRailSizing";

/** レールの幅とドラッグの状態。CodeViewer が 1 つ持ち、上段と下段で共有する。 */
export type AnnotationRail = ReturnType<typeof useAnnotationRailSizing>;

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

type CodeAnnotationRailProps = {
  anchors: AnnotationAnchor[];
  annotations: CodeAnnotation[];
  viewport: { height: number; width: number };
  selectedId?: string;
  onSelect(id: string): void;
  onClose(): void;
  onResizeStart(clientX: number): void;
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
};

export function CodeAnnotationRail({
  anchors,
  annotations,
  viewport,
  selectedId,
  onSelect,
  onClose,
  onResizeStart,
  resolveFileReference,
  onOpenFileReference,
}: CodeAnnotationRailProps) {
  return (
    <>
      <PanelResizeHandle
        className="code-annotation-resize-handle"
        label="注釈パネルの横幅を調整"
        onResizeStart={onResizeStart}
      />
      <CodeAnnotationLayer
        anchors={anchors}
        annotations={annotations}
        height={viewport.height}
        onClose={onClose}
        onSelect={onSelect}
        resolveFileReference={resolveFileReference}
        onOpenFileReference={onOpenFileReference}
        selectedId={selectedId}
        width={viewport.width}
      />
    </>
  );
}
