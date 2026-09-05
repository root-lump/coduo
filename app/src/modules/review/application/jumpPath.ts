// 開いているジャンプの列（jumpPath）から「今いる範囲」を導く純関数。
// 深さ 0 はステップの対象範囲、深さ n は n 番目のジャンプの飛び先。
import type { CodeJump, CodeRange, ReviewStep } from "../domain";

export type JumpScope = {
  file: string;
  range: CodeRange;
  /** この範囲から飛べるジャンプ。 */
  jumps: CodeJump[];
};

export function scopeOf(
  step: ReviewStep | undefined,
  path: CodeJump[],
): JumpScope | undefined {
  const last = path[path.length - 1];
  if (last) {
    return { file: last.to.file, range: last.to.range, jumps: last.jumps ?? [] };
  }
  if (!step?.target) return undefined;
  return {
    file: step.target.file,
    range: step.target.range,
    jumps: step.jumps ?? [],
  };
}

/** 今いる範囲の 1 つ上（開いているジャンプの参照元がある範囲）。深さ 0 では undefined。 */
export function parentScopeOf(
  step: ReviewStep | undefined,
  path: CodeJump[],
): JumpScope | undefined {
  if (path.length === 0) return undefined;
  return scopeOf(step, path.slice(0, -1));
}
