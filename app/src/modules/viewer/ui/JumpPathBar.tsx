// 分割表示の上に出すパンくず。ステップの対象ファイルから、開いたジャンプの列を辿って今の定義まで。
// 先頭と途中のチップは押すとそこまで戻り、先頭（深さ 0）で閉じる。
import { jumpLabel, type CodeJump } from "../../review";

type JumpPathBarProps = {
  /** 深さ 0 の表示名（ステップの対象ファイルのベース名）。 */
  rootLabel: string;
  path: CodeJump[];
  onJumpBack(depth: number): void;
};

export function JumpPathBar({ rootLabel, path, onJumpBack }: JumpPathBarProps) {
  return (
    <nav className="flow-path-bar" aria-label="ジャンプの来た道">
      <button
        type="button"
        className="flow-path-chip flow-path-chip--root"
        onClick={() => onJumpBack(0)}
      >
        {rootLabel}
      </button>
      {path.map((jump, index) => {
        const isCurrent = index === path.length - 1;
        const { glyph } = jumpLabel(jump.kind);
        return (
          <span key={jump.id} className="flow-path-item">
            <span className="flow-path-separator" aria-hidden="true">
              ›
            </span>
            {isCurrent ? (
              <span
                className={`flow-path-chip flow-path-chip--current flow-kind-${jump.kind}`}
                aria-current="location"
              >
                <span aria-hidden="true">{glyph}</span> {jump.symbol}
              </span>
            ) : (
              <button
                type="button"
                className={`flow-path-chip flow-kind-${jump.kind}`}
                onClick={() => onJumpBack(index + 1)}
              >
                <span aria-hidden="true">{glyph}</span> {jump.symbol}
              </button>
            )}
          </span>
        );
      })}
      <button
        type="button"
        className="flow-path-close"
        onClick={() => onJumpBack(0)}
        aria-label="ジャンプを閉じてステップに戻る"
      >
        閉じる
      </button>
    </nav>
  );
}
