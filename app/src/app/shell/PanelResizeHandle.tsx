import type { PointerEvent as ReactPointerEvent } from "react";

import type { ResizeSide } from "../../modules/layout";

type PanelResizeHandleProps = {
  label: string;
  side: ResizeSide;
  onResizeStart: (side: ResizeSide, clientX: number) => void;
};

export function PanelResizeHandle({
  label,
  side,
  onResizeStart,
}: PanelResizeHandleProps) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onResizeStart(side, event.clientX);
  };

  return (
    <div
      className="panel-resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
    >
      <span aria-hidden="true" />
    </div>
  );
}
