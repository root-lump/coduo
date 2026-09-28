// 分割表示の段の入退場。入場中・退場中の段は grid の行を 0 にして、transition で伸縮させる。

/** 段の伸縮にかける時間。viewer.css の .code-viewer-split などの transition と揃える。 */
export const PANE_TRANSITION_MS = 240;

export type PaneTransition<T> = {
  /** 今回の描画で初めて現れた段の深さ。次の描画で空に戻す。 */
  entering: ReadonlySet<number>;
  /** 描画から外れたが、縮み終わるまで残す段。深さ → 直前の段の内容。 */
  leaving: ReadonlyMap<number, T>;
};

export const EMPTY_PANE_TRANSITION: PaneTransition<never> = {
  entering: new Set(),
  leaving: new Map<number, never>(),
};

/**
 * 上段の列が previous から next に変わったときの入退場を出す。
 * - next にあって previous にも leaving にも無い深さ → entering
 * - previous にあって next に無い深さ → leaving（内容は previous のもの）。既存の leaving も next に無い限り保つ
 * - next にある深さは leaving から外す
 */
export function transitionPanes<T extends { depth: number }>(
  previous: readonly T[],
  next: readonly T[],
  current: PaneTransition<T>,
): PaneTransition<T> {
  const nextDepths = new Set(next.map((pane) => pane.depth));
  const previousDepths = new Set(previous.map((pane) => pane.depth));
  const leaving = new Map(current.leaving);
  for (const depth of nextDepths) leaving.delete(depth);
  for (const pane of previous) {
    if (!nextDepths.has(pane.depth)) leaving.set(pane.depth, pane);
  }
  // 退場中から戻った段はまだ行が縮みきっていないので、0fr から伸ばし直さない。
  const entering = new Set(
    [...nextDepths].filter(
      (depth) => !previousDepths.has(depth) && !current.leaving.has(depth),
    ),
  );
  return { entering, leaving };
}

/** 描画する上段の列。next と leaving を深さの昇順に並べる。 */
export function renderedOrigins<T extends { depth: number }>(
  next: readonly T[],
  leaving: ReadonlyMap<number, T>,
): T[] {
  return [...next, ...leaving.values()].sort((a, b) => a.depth - b.depth);
}

/** 退場が終わった段を外す。 */
export function settleLeaving<T>(current: PaneTransition<T>): PaneTransition<T> {
  if (current.leaving.size === 0) return current;
  return { entering: current.entering, leaving: new Map() };
}
