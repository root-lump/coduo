import type { ResolvedReviewStep, ReviewStep } from "../domain";

export function resolveReviewStep(
  step?: ReviewStep,
): ResolvedReviewStep | undefined {
  if (!step) {
    return undefined;
  }

  return {
    file: step.target?.file,
    focus: step.target ?? undefined,
    explanation: step.explanation,
    annotations: step.annotations.map((annotation, index) => ({
      ...annotation,
      id: annotation.id || `${step.id}-annotation-${index + 1}`,
    })),
    relation: step.relation ?? undefined,
  };
}

export function isReviewShortcut(
  event: KeyboardEvent,
  direction: "next" | "previous",
): boolean {
  if (!event.metaKey || !event.shiftKey) {
    return false;
  }
  return direction === "next"
    ? event.code === "BracketRight"
    : event.code === "BracketLeft";
}
