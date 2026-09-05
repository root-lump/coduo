// Tour のジャンプ（識別子から定義へ）に関する Monaco 装飾。
// 今いる範囲の式（クリックで飛べる印）、上段の参照元の式、下段の定義の識別子を描く。
// decorations.ts と同じく Monaco 実体に依存しない純関数にして、テストはプレーンオブジェクトで行う。
import type { editor } from "monaco-editor";
import type { CodeJump, CodeRange, JumpKind } from "../review";
import type { SymbolLocation } from "./codeNavigation";
import { focusRange } from "./decorations";

const JUMP_COLOR: Record<JumpKind, string> = {
  callee: "#e2ae57",
  data_flow: "#50d8c3",
};

export function jumpColor(kind: JumpKind): string {
  return JUMP_COLOR[kind];
}

function rangeOf(range: CodeRange, lineCount: number) {
  return focusRange({ file: "", range }, lineCount);
}

/** 今いる範囲のジャンプ。式ごとにクリックで飛べる印を付ける。 */
export function jumpDecorations(
  jumps: CodeJump[],
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  return jumps.flatMap((jump) => {
    const range = rangeOf(jump.from, lineCount);
    if (!range) return [];
    return [
      {
        range,
        options: {
          inlineClassName: `flow-jump flow-kind-${jump.kind}`,
          overviewRuler: { color: jumpColor(jump.kind), position: 4 },
        },
      },
    ];
  });
}

/** 上段用。開いているジャンプの参照元の式と、その行を淡く塗る。 */
export function originDecoration(
  from: CodeRange,
  kind: JumpKind,
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  const range = rangeOf(from, lineCount);
  if (!range) return [];
  return [
    {
      range,
      options: {
        inlineClassName: `flow-origin-range flow-kind-${kind}`,
        overviewRuler: { color: jumpColor(kind), position: 4 },
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

/** 下段用。定義の識別子（線の終点）。 */
export function definitionDecoration(
  anchor: SymbolLocation | undefined,
): editor.IModelDeltaDecoration[] {
  if (!anchor) return [];
  return [
    {
      range: {
        startLineNumber: anchor.lineNumber,
        startColumn: anchor.startColumn,
        endLineNumber: anchor.lineNumber,
        endColumn: anchor.endColumn,
      },
      options: { inlineClassName: "flow-definition" },
    },
  ];
}

/** エディタ上の位置（1 始まり）にあるジャンプ。終了列は式の直後なので含めない。 */
export function jumpAt(
  jumps: CodeJump[],
  lineNumber: number,
  column: number,
): CodeJump | undefined {
  return jumps.find((jump) => {
    const { startLine, endLine, startColumn = 1, endColumn } = jump.from;
    if (lineNumber < startLine || lineNumber > endLine) return false;
    if (lineNumber === startLine && column < startColumn) return false;
    if (
      endColumn !== undefined &&
      lineNumber === endLine &&
      column >= endColumn
    ) {
      return false;
    }
    return true;
  });
}
