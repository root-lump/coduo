import type { editor, IRange } from "monaco-editor";
import type { CodeAnnotation, CodeTarget } from "../review";
import type { ChangedLine } from "../workspace";

export function gitDecorations(
  changedLines: ChangedLine[],
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  return changedLines.map((change) => {
    const line = Math.min(Math.max(change.line, 1), lineCount);
    return {
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: `git-line-${change.kind}`,
        linesDecorationsClassName: `git-gutter-${change.kind}`,
        overviewRuler: {
          color:
            change.kind === "deleted"
              ? "#ef6a71"
              : change.kind === "added"
                ? "#3fb950"
                : "#d29922",
          position: 2,
        },
      },
    };
  });
}

export function focusDecoration(
  target: CodeTarget | undefined,
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  if (!target?.range) {
    return [];
  }
  const startLine = Math.min(Math.max(target.range.startLine, 1), lineCount);
  const endLine = Math.min(
    Math.max(target.range.endLine, startLine),
    lineCount,
  );
  const range: IRange = {
    startLineNumber: startLine,
    startColumn: Math.max(target.range.startColumn ?? 1, 1),
    endLineNumber: endLine,
    endColumn: Math.max(target.range.endColumn ?? 1, 1),
  };

  return [
    {
      range,
      options: {
        isWholeLine: true,
        className: "agent-focus-line",
        linesDecorationsClassName: "agent-focus-gutter",
        overviewRuler: { color: "#8b7cf6", position: 4 },
      },
    },
  ];
}

export function annotationDecorations(
  annotations: CodeAnnotation[],
  selectedId: string | undefined,
  lineCount: number,
): editor.IModelDeltaDecoration[] {
  return annotations.flatMap((annotation, index) => {
    const range = focusRange(annotation.target, lineCount);
    if (!range) return [];
    const color = (index % 4) + 1;
    const selected = annotation.id === selectedId ? " is-selected" : "";
    const hasColumns =
      annotation.target.range?.startColumn !== undefined &&
      annotation.target.range?.endColumn !== undefined;
    return [
      {
        range,
        options: {
          isWholeLine: !hasColumns,
          className: `code-annotation-range annotation-color-${color}${selected}`,
          overviewRuler: {
            color: ["#8b7cf6", "#3cc8b4", "#ed9b5f", "#df6fa8"][index % 4],
            position: 4,
          },
        },
      },
    ];
  });
}

export function focusRange(
  target: CodeTarget | undefined,
  lineCount: number,
): IRange | undefined {
  if (!target?.range) {
    return undefined;
  }
  const startLine = Math.min(Math.max(target.range.startLine, 1), lineCount);
  const endLine = Math.min(
    Math.max(target.range.endLine, startLine),
    lineCount,
  );
  return {
    startLineNumber: startLine,
    startColumn: Math.max(target.range.startColumn ?? 1, 1),
    endLineNumber: endLine,
    endColumn: Math.max(target.range.endColumn ?? 1, 1),
  };
}
