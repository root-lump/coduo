export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export const DEFAULT_ZOOM_LEVEL = 1;
export const DEFAULT_ZOOM_INDEX = ZOOM_LEVELS.indexOf(DEFAULT_ZOOM_LEVEL);

export type ZoomDirection = "in" | "out";

type ZoomShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "metaKey"
>;

export function nextZoomIndex(
  currentIndex: number,
  direction: ZoomDirection,
): number {
  const offset = direction === "in" ? 1 : -1;
  return Math.min(Math.max(currentIndex + offset, 0), ZOOM_LEVELS.length - 1);
}

export function zoomShortcutFor(
  event: ZoomShortcutEvent,
): ZoomDirection | undefined {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey) {
    return undefined;
  }

  if (event.code === "Equal" || event.code === "NumpadAdd") {
    return "in";
  }
  if (event.code === "Minus" || event.code === "NumpadSubtract") {
    return "out";
  }
  return undefined;
}
