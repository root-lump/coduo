import { useCallback, useEffect, useRef, useState } from "react";

import {
  constrainPanelWidths,
  loadPanelWidths,
  resolvePanelWidthStorage,
  resizePanelFromDrag,
  savePanelWidths,
  type PanelWidths,
  type ResizeSide,
} from "./panelSizing";
import { usePointerDrag } from "./usePointerDrag";

// 基準サイズを1.25倍にした際、旧バージョンの保存幅は狭すぎるため引き継がない。
const STORAGE_KEY = "coduo.panel-widths.v1";

const browserPanelWidthStorage = () =>
  typeof window === "undefined"
    ? undefined
    : resolvePanelWidthStorage(() => window.localStorage);

type ActiveResize = {
  side: ResizeSide;
  startWidths: PanelWidths;
};

export function usePanelSizing(hasLeftPanel: boolean) {
  const containerRef = useRef<HTMLElement>(null);
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(
    null,
  );
  const widthsRef = useRef<PanelWidths>(
    loadPanelWidths(browserPanelWidthStorage(), STORAGE_KEY),
  );
  const [widths, setWidths] = useState(widthsRef.current);
  const activeResizeRef = useRef<ActiveResize>(undefined);

  const containerWidth = () =>
    containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;

  const updateWidths = useCallback(
    (next: PanelWidths, side?: ResizeSide) => {
      const constrained = constrainPanelWidths(
        next,
        containerWidth(),
        hasLeftPanel,
        side,
      );
      widthsRef.current = constrained;
      setWidths(constrained);
    },
    [hasLeftPanel],
  );

  const drag = usePointerDrag({
    onMove: (deltaX) => {
      const active = activeResizeRef.current;
      if (!active) {
        return;
      }
      const resizedWidths = resizePanelFromDrag(
        active.startWidths,
        active.side,
        deltaX,
        containerWidth(),
        hasLeftPanel,
      );
      widthsRef.current = resizedWidths;
      setWidths(resizedWidths);
    },
  });
  const startDrag = drag.start;

  const startResize = useCallback(
    (side: ResizeSide, clientX: number) => {
      activeResizeRef.current = { side, startWidths: widthsRef.current };
      startDrag(clientX);
    },
    [startDrag],
  );

  const attachContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    setContainerElement(element);
  }, []);

  useEffect(() => {
    if (drag.isDragging) {
      return;
    }
    savePanelWidths(browserPanelWidthStorage(), STORAGE_KEY, widths);
  }, [drag.isDragging, widths]);

  useEffect(() => {
    if (!containerElement) {
      return;
    }

    const resizeObserver = new ResizeObserver(() =>
      updateWidths(widthsRef.current),
    );
    resizeObserver.observe(containerElement);
    updateWidths(widthsRef.current);
    return () => resizeObserver.disconnect();
  }, [containerElement, updateWidths]);

  return {
    containerRef: attachContainer,
    widths,
    isResizing: drag.isDragging,
    startResize,
  };
}
