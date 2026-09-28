// 開いているジャンプの列（jumpPath）から「今いる範囲」を導く純関数。
// 深さ 0 はステップの対象範囲、深さ n は n 番目のジャンプの飛び先。
import type { CodeAnnotation, CodeJump, CodeRange, ReviewStep } from "../domain";

export type JumpScope = {
  file: string;
  range: CodeRange;
  /** この範囲から飛べるジャンプ。 */
  jumps: CodeJump[];
  /** この範囲に置かれた注釈。 */
  annotations: CodeAnnotation[];
};

export function scopeOf(
  step: ReviewStep | undefined,
  path: CodeJump[],
): JumpScope | undefined {
  const last = path[path.length - 1];
  if (last) {
    return {
      file: last.to.file,
      range: last.to.range,
      jumps: last.jumps ?? [],
      annotations: (last.annotations ?? []).map((annotation, index) => ({
        ...annotation,
        id: annotation.id || `${last.id}-annotation-${index + 1}`,
      })),
    };
  }
  if (!step?.target) return undefined;
  return {
    file: step.target.file,
    range: step.target.range,
    jumps: step.jumps ?? [],
    annotations: step.annotations ?? [],
  };
}

export type OriginScope = {
  /** この段の深さ。0 はステップの対象範囲。 */
  depth: number;
  scope: JumpScope;
  /** この段から出ている（1 つ下の段を開いた）ジャンプ。 */
  jump: CodeJump;
};

/**
 * 開いているジャンプの列を、下段の直上まで並ぶ上段の範囲の列にする。
 * 表示は直近 maxOrigins 段に絞り、それより古い段はパンくずにだけ残す。
 * 途中の範囲が導けなければ空にする（呼び出し側は 1 面表示へ戻す）。
 */
export function originScopesOf(
  step: ReviewStep | undefined,
  path: CodeJump[],
  maxOrigins: number,
): OriginScope[] {
  const origins: OriginScope[] = [];
  const firstDepth = Math.max(0, path.length - maxOrigins);
  for (let depth = firstDepth; depth < path.length; depth++) {
    const scope = scopeOf(step, path.slice(0, depth));
    const jump = path[depth];
    if (!scope || !jump) return [];
    origins.push({ depth, scope, jump });
  }
  return origins;
}
