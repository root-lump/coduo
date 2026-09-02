import type { PointerEvent as ReactPointerEvent } from "react";

type PanelResizeHandleProps = {
  label: string;
  className?: string;
  onResizeStart: (clientX: number) => void;
};

export function PanelResizeHandle({
  label,
  className,
  onResizeStart,
}: PanelResizeHandleProps) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onResizeStart(event.clientX);
  };

  return (
    <div
      className={
        className ? `panel-resize-handle ${className}` : "panel-resize-handle"
      }
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
    >
      <span aria-hidden="true" />
    </div>
  );
}
