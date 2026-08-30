type ZoomControlsProps = {
  canZoomIn: boolean;
  canZoomOut: boolean;
  level: number;
  onZoomIn(): void;
  onZoomOut(): void;
};

export function ZoomControls({
  canZoomIn,
  canZoomOut,
  level,
  onZoomIn,
  onZoomOut,
}: ZoomControlsProps) {
  const percentage = Math.round(level * 100);

  return (
    <div className="zoom-controls" role="group" aria-label="表示倍率">
      <button
        type="button"
        className="zoom-button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="表示を縮小"
        title="表示を縮小 (⌘−)"
      >
        <span aria-hidden="true">−</span>
      </button>
      <output
        className="zoom-level"
        aria-label={`現在の表示倍率 ${percentage}%`}
        aria-live="polite"
      >
        {percentage}%
      </output>
      <button
        type="button"
        className="zoom-button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="表示を拡大"
        title="表示を拡大 (⌘＋)"
      >
        <span aria-hidden="true">＋</span>
      </button>
    </div>
  );
}
