import { useCallback, useEffect, useMemo, useState } from "react";
import type { CodeJump, ReviewTour } from "../domain";
import { isReviewShortcut, resolveReviewStep } from "./reviewController";

export function useReviewController(tour: ReviewTour) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isExploring, setIsExploring] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  // 開いているジャンプの列。先頭がステップの範囲から飛んだもの、末尾が今見ている定義。
  // ジャンプはステップと別の概念だが、ステップを離れたら閉じる。
  const [jumpPath, setJumpPath] = useState<CodeJump[]>([]);

  useEffect(() => {
    setCurrentStepIndex(0);
    setIsExploring(false);
    setJumpPath([]);
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
      setJumpPath([]);
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

  const markExploring = useCallback(() => {
    setIsExploring(true);
    setJumpPath([]);
  }, []);
  const resumeReview = useCallback(() => {
    setIsExploring(false);
    setJumpPath([]);
    setFocusToken((token) => token + 1);
  }, []);

  const openJump = useCallback(
    (jump: CodeJump) => setJumpPath((path) => [...path, jump]),
    [],
  );
  /**
   * 深さ depth の範囲からジャンプを開く。depth より深い列を捨ててから積むので、
   * 上段（親の範囲）で別のジャンプを選ぶと、今見ている定義がそれに置き換わる。
   */
  const openJumpAt = useCallback(
    (depth: number, jump: CodeJump) =>
      setJumpPath((path) => [...path.slice(0, Math.max(0, depth)), jump]),
    [],
  );
  /** 深さ depth まで戻る。0 で全部閉じる。 */
  const backToDepth = useCallback(
    (depth: number) => setJumpPath((path) => path.slice(0, Math.max(0, depth))),
    [],
  );
  const closeJumps = useCallback(() => setJumpPath([]), []);

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
    backToDepth,
    closeJumps,
    currentStep,
    currentStepIndex,
    focusToken,
    goNext,
    goPrevious,
    goToStep,
    isExploring,
    jumpPath,
    markExploring,
    openJump,
    openJumpAt,
    resolvedStep,
    resumeReview,
  };
}
