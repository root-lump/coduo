import { describe, expect, it } from "vitest";
import {
  annotationAtPosition,
  annotationChangeKind,
  containsCodePosition,
} from "./codeAnnotations";

describe("code annotations", () => {
  it("uses columns when available and whole lines otherwise", () => {
    expect(
      containsCodePosition(
        { startLine: 2, startColumn: 4, endLine: 2, endColumn: 8 },
        2,
        3,
      ),
    ).toBe(false);
    expect(
      containsCodePosition(
        { startLine: 2, startColumn: 4, endLine: 2, endColumn: 8 },
        2,
        6,
      ),
    ).toBe(true);
    expect(containsCodePosition({ startLine: 3, endLine: 4 }, 4, 99)).toBe(
      true,
    );
  });

  it("finds the annotation containing a clicked code position", () => {
    const annotation = annotationAtPosition(
      [
        {
          id: "a",
          label: "A",
          explanation: "A",
          target: { file: "a.ts", range: { startLine: 5, endLine: 6 } },
        },
      ],
      6,
      20,
    );
    expect(annotation?.id).toBe("a");
  });
});

describe("annotationChangeKind", () => {
  const annotation = {
    id: "a",
    label: "A",
    explanation: "A",
    target: { file: "a.ts", range: { startLine: 5, endLine: 9 } },
  };

  it("ブロックの先頭行の変更種別を返す", () => {
    expect(
      annotationChangeKind(annotation, [
        { line: 4, kind: "deleted" },
        { line: 5, kind: "added" },
        { line: 9, kind: "modified" },
      ]),
    ).toBe("added");
  });

  it("先頭行が変更行でなければ undefined", () => {
    expect(annotationChangeKind(annotation, [{ line: 9, kind: "added" }])).toBe(
      undefined,
    );
    expect(annotationChangeKind(annotation, [])).toBe(undefined);
  });
});
