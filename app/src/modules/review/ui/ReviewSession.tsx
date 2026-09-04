// 生成済みツアーの表示（タイトル・現在ステップ・説明経路・再開・劣化警告）。
import type {
  JumpRelation,
  ReviewMode,
  ReviewTour,
  StepOrigin,
} from "../domain";
import { hopLabel, relationLabel } from "../application/relation";
import type { FileReference } from "../../workspace";
import { reviewModeLabel } from "./SnapshotStatus";
import { TourMarkdown } from "./TourMarkdown";

export type ReviewSessionViewModel = {
  tour: ReviewTour;
  currentStepIndex: number;
  explanation?: string;
  relation?: JumpRelation;
  /** どの式から来たか。あれば relation の代わりにこちらをバッジに出す。 */
  origin?: StepOrigin;
  isExploring: boolean;
  mode?: ReviewMode;
  /** ツアーは成立しているが利用者へ伝える劣化（注釈修復の失敗など）。 */
  warnings: string[];
  /** 説明文のインラインコードをファイル参照として解釈する。 */
  resolveFileReference(text: string): FileReference | undefined;
  onOpenFileReference(reference: FileReference): void;
  onResume(): void;
  onSelectStep(index: number): void;
};

export function ReviewSession({
  tour,
  currentStepIndex,
  explanation,
  relation,
  origin,
  isExploring,
  mode,
  warnings,
  resolveFileReference,
  onOpenFileReference,
  onResume,
  onSelectStep,
}: ReviewSessionViewModel) {
  const step = tour.steps[currentStepIndex];
  const stepHasFocus = Boolean(step?.target);

  return (
    <div className="review-body">
      <div className="active-review-mode">{reviewModeLabel(mode)}</div>
      <h1>{tour.title}</h1>
      <TourMarkdown
        className="tour-summary"
        text={tour.summary}
        resolveFileReference={resolveFileReference}
        onOpenFileReference={onOpenFileReference}
      />

      {warnings.length > 0 && (
        <div className="review-warnings" role="note">
          {warnings.map((warning) => (
            <p key={warning}>
              <span aria-hidden="true">⚠</span> {warning}
            </p>
          ))}
        </div>
      )}

      {isExploring && stepHasFocus && (
        <button type="button" className="resume-card" onClick={onResume}>
          <span className="resume-icon" aria-hidden="true">
            ↳
          </span>
          <span>
            <strong>レビューを再開</strong>
            <small>現在のAgent Focusに戻ります</small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      {step ? (
        <article
          className="current-explanation"
          data-testid="current-explanation"
        >
          <div className="step-meta">
            <span>ステップ {currentStepIndex + 1}</span>
            {step.annotations.length > 0 && (
              <span className="annotation-count-badge">
                コード注釈 {step.annotations.length}
              </span>
            )}
            {origin ? (
              <span className={`hop-badge hop-badge--${origin.kind}`}>
                <span aria-hidden="true">{hopLabel(origin.kind).glyph}</span>{" "}
                {hopLabel(origin.kind).label}
                <code>
                  {origin.file}:{origin.range.startLine}
                </code>
              </span>
            ) : (
              relation && (
                <span className="relation-badge">
                  <span aria-hidden="true">↗</span> {relationLabel(relation)}
                </span>
              )
            )}
          </div>
          <h2>{step.title}</h2>
          <TourMarkdown
            className="step-explanation"
            text={explanation ?? step.explanation}
            resolveFileReference={resolveFileReference}
            onOpenFileReference={onOpenFileReference}
          />
          {stepHasFocus && (
            <div className="focus-legend">
              <span className="focus-swatch" aria-hidden="true" />
              <span>Agent Focusはコード内で強調表示されています。</span>
            </div>
          )}
        </article>
      ) : (
        <p className="panel-empty">説明できるステップがありません。</p>
      )}

      <div className="tour-outline-heading">説明経路</div>
      <ol className="tour-outline">
        {tour.steps.map((tourStep, index) => (
          <li
            key={tourStep.id}
            className={index < currentStepIndex ? "is-complete" : ""}
          >
            <button
              type="button"
              className={index === currentStepIndex ? "is-current" : ""}
              onClick={() => onSelectStep(index)}
              aria-current={index === currentStepIndex ? "step" : undefined}
            >
              <span className="outline-marker">
                {index < currentStepIndex ? "✓" : index + 1}
              </span>
              <span>
                <strong>{tourStep.title}</strong>
                <small>
                  {tourStep.target?.file ??
                    (mode === "pull_request"
                      ? "差分コンテキスト"
                      : "コードコンテキスト")}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
