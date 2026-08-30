import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ZOOM_INDEX,
  DEFAULT_ZOOM_LEVEL,
  nextZoomIndex,
  ZOOM_LEVELS,
  zoomShortcutFor,
} from "./zoomController";
import type { WebviewZoom } from "../ports";

export function useZoom(webviewZoom: WebviewZoom) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const level = ZOOM_LEVELS[zoomIndex] ?? DEFAULT_ZOOM_LEVEL;

  const zoomIn = useCallback(() => {
    setZoomIndex((currentIndex) => nextZoomIndex(currentIndex, "in"));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomIndex((currentIndex) => nextZoomIndex(currentIndex, "out"));
  }, []);

  useEffect(() => {
    void webviewZoom.apply(level).catch((error: unknown) => {
      console.error("表示倍率を変更できませんでした", error);
    });
  }, [level, webviewZoom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = zoomShortcutFor(event);
      if (!direction) {
        return;
      }

      event.preventDefault();
      if (direction === "in") {
        zoomIn();
      } else {
        zoomOut();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [zoomIn, zoomOut]);

  return {
    canZoomIn: zoomIndex < ZOOM_LEVELS.length - 1,
    canZoomOut: zoomIndex > 0,
    level,
    zoomIn,
    zoomOut,
  };
}
