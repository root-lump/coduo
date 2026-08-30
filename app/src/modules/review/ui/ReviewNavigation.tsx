type ReviewNavigationProps = {
  currentIndex: number;
  onNext(): void;
  onPrevious(): void;
  total: number;
};

export function ReviewNavigation({
  currentIndex,
  onNext,
  onPrevious,
  total,
}: ReviewNavigationProps) {
  const hasSteps = total > 0;
  const progress = hasSteps ? ((currentIndex + 1) / total) * 100 : 0;

  return (
    <footer className="review-navigation">
      <button
        type="button"
        className="navigation-button navigation-previous"
        onClick={onPrevious}
        disabled={!hasSteps || currentIndex === 0}
        aria-label="前のレビューステップ"
      >
        <span aria-hidden="true">←</span>
        <span>前へ</span>
        <kbd>⌘⇧[</kbd>
      </button>

      <div
        className="progress-group"
        aria-label={`レビュー進捗 ${hasSteps ? currentIndex + 1 : 0} / ${total}`}
      >
        <div className="progress-copy">
          <span>レビュー進捗</span>
          <strong>
            {hasSteps ? currentIndex + 1 : 0} / {total}
          </strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={hasSteps ? currentIndex + 1 : 0}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <button
        type="button"
        className="navigation-button navigation-next"
        onClick={onNext}
        disabled={!hasSteps || currentIndex >= total - 1}
        aria-label="次のレビューステップ"
      >
        <kbd>⌘⇧]</kbd>
        <span>次へ</span>
        <span aria-hidden="true">→</span>
      </button>
    </footer>
  );
}
