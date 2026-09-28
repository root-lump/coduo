// 分割表示の段の折りたたみ状態。折りたたんだ段の深さ（0 はステップの範囲）の集合で持つ。

/** depth の折りたたみを反転した新しい集合を返す。 */
export function toggleCollapsed(
  collapsed: ReadonlySet<number>,
  depth: number,
): Set<number> {
  const next = new Set(collapsed);
  if (next.has(depth)) next.delete(depth);
  else next.add(depth);
  return next;
}

/**
 * ジャンプの列が変わったあとに残す折りたたみ状態。
 * 下段（深さ pathLength）とそれより深い段は常に展開に戻す（開いた直後の定義を隠さない）。
 * pathLength が 0（全部閉じた）なら空にする。
 * 変化がなければ同じ参照を返す（state に入れたとき再描画を起こさないため）。
 */
export function pruneCollapsed<T extends ReadonlySet<number>>(
  collapsed: T,
  pathLength: number,
): T | Set<number> {
  const kept = [...collapsed].filter((depth) => depth < pathLength);
  return kept.length === collapsed.size ? collapsed : new Set(kept);
}
