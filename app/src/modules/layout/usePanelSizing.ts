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

// 基準サイズを1.25倍にした際、旧バージョンの保存幅は狭すぎるため引き継がない。
const STORAGE_KEY = "coduo.panel-widths.v1";

const browserPanelWidthStorage = () =>
  typeof window === "undefined"
    ? undefined
    : resolvePanelWidthStorage(() => window.localStorage);

type ActiveResize = {
  side: ResizeSide;
  startX: number;
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
  const [activeResize, setActiveResize] = useState<ActiveResize>();

  const updateWidths = useCallback(
    (next: PanelWidths, side?: ResizeSide) => {
      const containerWidth =
        containerRef.current?.getBoundingClientRect().width ??
        window.innerWidth;
      const constrained = constrainPanelWidths(
        next,
        containerWidth,
        hasLeftPanel,
        side,
      );
      widthsRef.current = constrained;
      setWidths(constrained);
    },
    [hasLeftPanel],
  );

  const startResize = useCallback((side: ResizeSide, clientX: number) => {
    setActiveResize({ side, startX: clientX, startWidths: widthsRef.current });
  }, []);

  const attachContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    setContainerElement(element);
  }, []);

  useEffect(() => {
    if (!activeResize) {
      return;
    }

    document.documentElement.classList.add("is-resizing-panels");

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - activeResize.startX;
      const containerWidth =
        containerRef.current?.getBoundingClientRect().width ??
        window.innerWidth;
      const resizedWidths = resizePanelFromDrag(
        activeResize.startWidths,
        activeResize.side,
        delta,
        containerWidth,
        hasLeftPanel,
      );
      widthsRef.current = resizedWidths;
      setWidths(resizedWidths);
    };
    const finishResize = () => setActiveResize(undefined);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });

    return () => {
      document.documentElement.classList.remove("is-resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [activeResize, hasLeftPanel, updateWidths]);

  useEffect(() => {
    if (activeResize) {
      return;
    }
    savePanelWidths(browserPanelWidthStorage(), STORAGE_KEY, widths);
  }, [activeResize, widths]);

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
    isResizing: Boolean(activeResize),
    startResize,
  };
}
