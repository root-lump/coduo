// 注釈レール（エディタ右側の注釈カード列）の幅の制約と保存。
// 幅はエディタ面を右に空ける量そのもので、レール本体とカードの幅は CSS 側で
// この値から導く（viewer.css の --annotation-rail-width）。

export const DEFAULT_ANNOTATION_RAIL_WIDTH = 358;

export const ANNOTATION_RAIL_LIMITS = {
  min: 250,
  /** レールを広げてもエディタ本体に残す幅。 */
  editorMin: 400,
  /** これより狭いときはカードを 2 列構成に落とす。 */
  narrowBelow: 300,
} as const;

export type AnnotationRailWidthStorage = Pick<Storage, "getItem" | "setItem">;

const finiteWidth = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_ANNOTATION_RAIL_WIDTH;

export function constrainAnnotationRailWidth(
  width: number,
  containerWidth: number,
): number {
  const maximum = Math.max(
    ANNOTATION_RAIL_LIMITS.min,
    finiteWidth(containerWidth) - ANNOTATION_RAIL_LIMITS.editorMin,
  );
  return Math.min(Math.max(finiteWidth(width), ANNOTATION_RAIL_LIMITS.min), maximum);
}

export function isNarrowAnnotationRail(width: number): boolean {
  return width < ANNOTATION_RAIL_LIMITS.narrowBelow;
}

export function parseStoredAnnotationRailWidth(value: string | null): number {
  if (!value) {
    return DEFAULT_ANNOTATION_RAIL_WIDTH;
  }
  try {
    return finiteWidth(JSON.parse(value));
  } catch {
    return DEFAULT_ANNOTATION_RAIL_WIDTH;
  }
}

export function loadAnnotationRailWidth(
  storage: AnnotationRailWidthStorage | undefined,
  key: string,
): number {
  try {
    return parseStoredAnnotationRailWidth(storage?.getItem(key) ?? null);
  } catch {
    return DEFAULT_ANNOTATION_RAIL_WIDTH;
  }
}

export function saveAnnotationRailWidth(
  storage: AnnotationRailWidthStorage | undefined,
  key: string,
  width: number,
) {
  try {
    storage?.setItem(key, JSON.stringify(width));
  } catch {
    // ストレージが使えなくても、レールのリサイズ自体は動くようにする。
  }
}
