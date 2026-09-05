// 生成済みツアーの表示（タイトル・現在ステップ・説明経路・再開・劣化警告）。
import type { CodeJump, JumpRelation, ReviewMode, ReviewTour } from "../domain";
import { jumpLabel, relationLabel } from "../application/relation";
import type { FileReference } from "../../workspace";
import { reviewModeLabel } from "./SnapshotStatus";
import { TourMarkdown } from "./TourMarkdown";

export type ReviewSessionViewModel = {
  tour: ReviewTour;
  currentStepIndex: number;
  explanation?: string;
  relation?: JumpRelation;
  /** 今いる範囲（ステップの対象か、開いているジャンプの定義）から飛べるジャンプ。 */
  jumps: CodeJump[];
  /** 開いているジャンプの列。空ならステップの 1 面表示。 */
  jumpPath: CodeJump[];
  onOpenJump(jump: CodeJump): void;
  onJumpBack(depth: number): void;
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
  jumps,
  jumpPath,
  onOpenJump,
  onJumpBack,
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
            {relation && (
              <span className="relation-badge">
                <span aria-hidden="true">↗</span> {relationLabel(relation)}
              </span>
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
          {(jumpPath.length > 0 || jumps.length > 0) && (
            <JumpSection
              jumps={jumps}
              jumpPath={jumpPath}
              onOpenJump={onOpenJump}
              onJumpBack={onJumpBack}
              resolveFileReference={resolveFileReference}
              onOpenFileReference={onOpenFileReference}
            />
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

type JumpSectionProps = Pick<
  ReviewSessionViewModel,
  | "jumps"
  | "jumpPath"
  | "onOpenJump"
  | "onJumpBack"
  | "resolveFileReference"
  | "onOpenFileReference"
>;

/** ステップ説明の下に出すジャンプの欄。開いているジャンプの来た道と説明、今いる範囲から飛べるジャンプの一覧。 */
function JumpSection({
  jumps,
  jumpPath,
  onOpenJump,
  onJumpBack,
  resolveFileReference,
  onOpenFileReference,
}: JumpSectionProps) {
  const current = jumpPath[jumpPath.length - 1];
  return (
    <section className="jump-section" aria-label="ジャンプ">
      {current && (
        <div className="jump-current">
          <ol className="jump-path">
            {jumpPath.map((jump, index) => (
              <li key={jump.id}>
                {index === jumpPath.length - 1 ? (
                  <span className={`jump-chip jump-chip--current jump-kind-${jump.kind}`}>
                    <span aria-hidden="true">{jumpLabel(jump.kind).glyph}</span>{" "}
                    {jump.symbol}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`jump-chip jump-kind-${jump.kind}`}
                    onClick={() => onJumpBack(index + 1)}
                  >
                    <span aria-hidden="true">{jumpLabel(jump.kind).glyph}</span>{" "}
                    {jump.symbol}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {(current.annotations?.length ?? 0) > 0 && (
            <span className="annotation-count-badge">
              コード注釈 {current.annotations?.length}
            </span>
          )}
          <TourMarkdown
            className="jump-explanation"
            text={current.explanation}
            resolveFileReference={resolveFileReference}
            onOpenFileReference={onOpenFileReference}
          />
          <button
            type="button"
            className="jump-close"
            onClick={() => onJumpBack(0)}
          >
            ジャンプを閉じてステップに戻る
          </button>
        </div>
      )}
      {jumps.length > 0 && (
        <>
          <div className="jump-list-heading">
            {current ? "この定義から飛べるジャンプ" : "この範囲から飛べるジャンプ"}
          </div>
          <ul className="jump-list">
            {jumps.map((jump) => (
              <li key={jump.id}>
                <button
                  type="button"
                  className={`jump-item jump-kind-${jump.kind}`}
                  aria-label={`${jump.symbol} の定義へ（${jumpLabel(jump.kind).label}）`}
                  onClick={() => onOpenJump(jump)}
                >
                  <span className="jump-item-kind">
                    <span aria-hidden="true">{jumpLabel(jump.kind).glyph}</span>{" "}
                    {jumpLabel(jump.kind).label}
                  </span>
                  <code>{jump.symbol}</code>
                  <span className="jump-item-to">{jump.to.file}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
