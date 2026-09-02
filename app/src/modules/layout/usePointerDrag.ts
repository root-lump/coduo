import { useCallback, useEffect, useRef, useState } from "react";

type UsePointerDragOptions = {
  /** ドラッグ開始位置からの水平移動量ごとに呼ばれる。 */
  onMove(deltaX: number): void;
};

/**
 * 横方向のドラッグを window の pointer イベントで追う。
 * ドラッグ中は document に `is-resizing-panels` を付け、カーソルと選択の抑止を CSS に任せる。
 * パネル幅と注釈レール幅のリサイズが共用する。
 */
export function usePointerDrag({ onMove }: UsePointerDragOptions) {
  const [startX, setStartX] = useState<number>();
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const start = useCallback((clientX: number) => setStartX(clientX), []);

  useEffect(() => {
    if (startX === undefined) {
      return;
    }

    document.documentElement.classList.add("is-resizing-panels");

    const handlePointerMove = (event: PointerEvent) => {
      onMoveRef.current(event.clientX - startX);
    };
    const finish = () => setStartX(undefined);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });

    return () => {
      document.documentElement.classList.remove("is-resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [startX]);

  return { start, isDragging: startX !== undefined };
}
