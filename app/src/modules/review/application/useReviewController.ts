import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewTour } from "../domain";
import { isReviewShortcut, resolveReviewStep } from "./reviewController";

export function useReviewController(tour: ReviewTour) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isExploring, setIsExploring] = useState(false);
  const [focusToken, setFocusToken] = useState(0);

  useEffect(() => {
    setCurrentStepIndex(0);
    setIsExploring(false);
    setFocusToken((token) => token + 1);
  }, [tour]);

  const currentStep = tour.steps[currentStepIndex];
  const resolvedStep = useMemo(
    () => resolveReviewStep(currentStep),
    [currentStep],
  );

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= tour.steps.length) {
        return;
      }
      setCurrentStepIndex(index);
      setIsExploring(false);
      setFocusToken((token) => token + 1);
    },
    [tour.steps.length],
  );

  const goNext = useCallback(
    () => goToStep(currentStepIndex + 1),
    [currentStepIndex, goToStep],
  );
  const goPrevious = useCallback(
    () => goToStep(currentStepIndex - 1),
    [currentStepIndex, goToStep],
  );

  const markExploring = useCallback(() => setIsExploring(true), []);
  const resumeReview = useCallback(() => {
    setIsExploring(false);
    setFocusToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isReviewShortcut(event, "next")) {
        event.preventDefault();
        goNext();
      } else if (isReviewShortcut(event, "previous")) {
        event.preventDefault();
        goPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious]);

  return {
    currentStep,
    currentStepIndex,
    focusToken,
    goNext,
    goPrevious,
    goToStep,
    isExploring,
    markExploring,
    resolvedStep,
    resumeReview,
  };
}
