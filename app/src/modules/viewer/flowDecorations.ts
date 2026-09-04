// Tour の from（どの式から来たか）に関する Monaco 装飾。
// 上段（呼び出し元）の式と、下段で次のステップへ進む印になる式を描く。
// decorations.ts と同じく Monaco 実体に依存しない純関数にして、テストはプレーンオブジェクトで行う。
import type { editor } from "monaco-editor";
import type { CodeTarget, HopKind, StepOrigin } from "../review";
import { focusRange } from "./decorations";

/** 次のステップの from。今の対象ファイル内にあるときだけ CodeViewer に渡る。 */
export type NextHop = {
  kind: HopKind;
  target: CodeTarget;
};

const HOP_COLOR: Record<HopKind, string> = {
  callee: "#e2ae57",
  data_flow: "#50d8c3",
  return: "#61c6d7",
};

export function hopColor(kind: HopKind): string {
  return HOP_COLOR[kind];
}

/** 上段用。式そのものと、その行を淡く塗る。 */
export function originDecoration(
  origin: StepOrigin,
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  const range = focusRange(origin, lineCount);
  if (!range) return [];
  return [
    {
      range,
      options: {
        inlineClassName: `flow-origin-range flow-kind-${origin.kind}`,
        overviewRuler: { color: hopColor(origin.kind), position: 4 },
      },
    },
    {
      range,
      options: {
        isWholeLine: true,
        className: "flow-origin-line",
      },
    },
  ];
}

/** 下段用。次のステップへ進む印になる式。 */
export function nextHopDecoration(
  hop: NextHop,
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  const range = focusRange(hop.target, lineCount);
  if (!range) return [];
  return [
    {
      range,
      options: {
        inlineClassName: `flow-next-hop flow-kind-${hop.kind}`,
        overviewRuler: { color: hopColor(hop.kind), position: 4 },
      },
    },
  ];
}

/** エディタ上の位置（1 始まり）が次ホップの式の中にあるか。終了列は式の直後なので含めない。 */
export function isInsideHop(
  hop: NextHop | undefined,
  lineNumber: number,
  column: number,
): boolean {
  if (!hop) return false;
  const { startLine, endLine, startColumn = 1, endColumn } = hop.target.range;
  if (lineNumber < startLine || lineNumber > endLine) return false;
  if (lineNumber === startLine && column < startColumn) return false;
  if (endColumn !== undefined && lineNumber === endLine && column >= endColumn) {
    return false;
  }
  return true;
}
