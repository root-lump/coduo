import { useCallback, useEffect, useRef, useState } from "react";
import { usePointerDrag } from "../../layout";
import {
  constrainAnnotationRailWidth,
  isNarrowAnnotationRail,
  loadAnnotationRailWidth,
  saveAnnotationRailWidth,
  type AnnotationRailWidthStorage,
} from "../annotationRailSizing";

const STORAGE_KEY = "coduo.annotation-rail-width.v1";

const browserStorage = (): AnnotationRailWidthStorage | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * 注釈レールの幅をコンテナ（.code-viewer）の幅に収めつつ、ハンドルのドラッグで変える。
 * 幅はドラッグを終えたときに保存し、次回の起動でも同じ幅で開く。
 */
export function useAnnotationRailSizing(containerElement: HTMLElement | null) {
  const widthRef = useRef(loadAnnotationRailWidth(browserStorage(), STORAGE_KEY));
  const [width, setWidth] = useState(widthRef.current);
  const startWidthRef = useRef(widthRef.current);

  const containerWidth = useCallback(
    () =>
      containerElement?.getBoundingClientRect().width ??
      (typeof window === "undefined" ? 0 : window.innerWidth),
    [containerElement],
  );

  const applyWidth = useCallback(
    (next: number) => {
      const constrained = constrainAnnotationRailWidth(next, containerWidth());
      widthRef.current = constrained;
      setWidth(constrained);
    },
    [containerWidth],
  );

  const drag = usePointerDrag({
    // ハンドルはレールの左端にあるので、左へ動かすほどレールが広がる。
    onMove: (deltaX) => applyWidth(startWidthRef.current - deltaX),
  });
  const startDrag = drag.start;

  const startResize = useCallback(
    (clientX: number) => {
      startWidthRef.current = widthRef.current;
      startDrag(clientX);
    },
    [startDrag],
  );

  useEffect(() => {
    if (drag.isDragging) {
      return;
    }
    saveAnnotationRailWidth(browserStorage(), STORAGE_KEY, width);
  }, [drag.isDragging, width]);

  useEffect(() => {
    if (!containerElement) {
      return;
    }
    const observer = new ResizeObserver(() => applyWidth(widthRef.current));
    observer.observe(containerElement);
    applyWidth(widthRef.current);
    return () => observer.disconnect();
  }, [applyWidth, containerElement]);

  return {
    width,
    isNarrow: isNarrowAnnotationRail(width),
    isResizing: drag.isDragging,
    startResize,
  };
}
