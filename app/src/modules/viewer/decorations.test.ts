import { describe, expect, it } from "vitest";
import { annotationDecorations } from "./decorations";

describe("annotationDecorations", () => {
  it("adds one range highlight per annotation", () => {
    const decorations = annotationDecorations(
      [
        {
          id: "flow",
          label: "Flow",
          explanation: "Tracks the flow.",
          target: { file: "flow.ts", range: { startLine: 3, endLine: 6 } },
        },
      ],
      "flow",
      20,
    );

    expect(decorations).toHaveLength(1);
    expect(decorations[0].options.isWholeLine).toBe(true);
    expect(decorations[0].options.glyphMarginClassName).toBeUndefined();
  });

  it("uses an exact column range when both columns are available", () => {
    const decorations = annotationDecorations(
      [
        {
          id: "token",
          label: "Token",
          explanation: "Highlights one token.",
          target: {
            file: "flow.ts",
            range: { startLine: 2, startColumn: 4, endLine: 2, endColumn: 9 },
          },
        },
      ],
      undefined,
      20,
    );

    expect(decorations[0].options.isWholeLine).toBe(false);
    expect(decorations[0].range).toMatchObject({
      startLineNumber: 2,
      startColumn: 4,
      endLineNumber: 2,
      endColumn: 9,
    });
  });
});
