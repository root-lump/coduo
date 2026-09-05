// 分割表示の線の座標。エディタ内の位置（Monaco のレイアウト px）を、線を描く
// コンテナの座標系に変換する。
export type Rect = { left: number; top: number; width: number; height: number };
export type Point = { x: number; y: number };

/**
 * getBoundingClientRect の値を、ズーム前のレイアウト px に戻す係数。
 * アプリのズームは document 直下の CSS zoom で、Chromium の getBoundingClientRect は
 * ズーム後の値を返す一方、Monaco の getScrolledVisiblePosition と、コンテナ内に
 * 絶対配置した SVG の座標はズーム前の値なので、矩形の差分だけを割って揃える。
 */
export function layoutScaleOf(rectWidth: number, offsetWidth: number): number {
  return offsetWidth > 0 && rectWidth > 0 ? rectWidth / offsetWidth : 1;
}

/**
 * エディタ内の位置をコンテナ座標に変換し、縦はそのエディタの範囲に収める
 * （部分的に見えている行のため）。
 */
export function containerPoint(args: {
  editorRect: Rect;
  containerRect: Rect;
  scale: number;
  position: { left: number; top: number; height: number };
}): Point {
  const { editorRect, containerRect, scale, position } = args;
  const offsetX = (editorRect.left - containerRect.left) / scale;
  const offsetY = (editorRect.top - containerRect.top) / scale;
  const editorHeight = editorRect.height / scale;
  const rawY = offsetY + position.top + position.height / 2;
  return {
    x: offsetX + position.left,
    y: Math.min(Math.max(rawY, offsetY), offsetY + editorHeight),
  };
}
