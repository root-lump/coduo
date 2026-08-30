import { describe, expect, it } from "vitest";
import type { ReviewStep } from "../domain";
import { isReviewShortcut, resolveReviewStep } from "./reviewController";

describe("resolveReviewStep", () => {
  it("maps the normalized step onto the UI shape and fills annotation ids", () => {
    const step: ReviewStep = {
      id: "validation",
      title: "Validation",
      explanation: "The request is rejected before persistence.",
      target: {
        file: "validation.go",
        range: { startLine: 10, endLine: 11 },
      },
      relation: "definition",
      annotations: [
        {
          id: "",
          label: "Guard",
          explanation: "Reject invalid input.",
          target: {
            file: "validation.go",
            range: {
              startLine: 10,
              startColumn: 4,
              endLine: 10,
              endColumn: 18,
            },
          },
        },
      ],
    };

    expect(resolveReviewStep(step)).toEqual({
      file: "validation.go",
      focus: { file: "validation.go", range: { startLine: 10, endLine: 11 } },
      explanation: "The request is rejected before persistence.",
      annotations: [
        {
          id: "validation-annotation-1",
          label: "Guard",
          explanation: "Reject invalid input.",
          target: {
            file: "validation.go",
            range: {
              startLine: 10,
              startColumn: 4,
              endLine: 10,
              endColumn: 18,
            },
          },
        },
      ],
      relation: "definition",
    });
  });

  it("keeps overview steps without a target as explanation-only", () => {
    const overview: ReviewStep = {
      id: "overview",
      title: "Overview",
      explanation: "全体像の説明",
      target: null,
      relation: null,
      annotations: [],
    };

    expect(resolveReviewStep(overview)).toEqual({
      file: undefined,
      focus: undefined,
      explanation: "全体像の説明",
      annotations: [],
      relation: undefined,
    });
  });

  it("returns undefined when a tour has no step", () => {
    expect(resolveReviewStep(undefined)).toBeUndefined();
  });
});

describe("isReviewShortcut", () => {
  it("matches the documented macOS shortcuts", () => {
    const next = {
      metaKey: true,
      shiftKey: true,
      key: "}",
      code: "BracketRight",
    } as KeyboardEvent;
    const previous = {
      metaKey: true,
      shiftKey: true,
      key: "{",
      code: "BracketLeft",
    } as KeyboardEvent;

    expect(isReviewShortcut(next, "next")).toBe(true);
    expect(isReviewShortcut(previous, "previous")).toBe(true);
    expect(
      isReviewShortcut({ ...next, metaKey: false } as KeyboardEvent, "next"),
    ).toBe(false);
    expect(
      isReviewShortcut({ ...next, code: "Digit0" } as KeyboardEvent, "next"),
    ).toBe(false);
  });
});
