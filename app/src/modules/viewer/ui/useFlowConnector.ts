// 分割表示で、上段の参照元の式と下段の定義の識別子を結ぶ線の座標を出す。
// 両エディタのスクロールとレイアウト、コンテナのサイズ変化に追従し、rAF でまとめて再計算する。
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import type { CodeRange, JumpKind } from "../../review";
import type { SymbolLocation } from "../codeNavigation";
import { jumpColor } from "../flowDecorations";

type FlowConnectorArgs = {
  container: HTMLElement | null;
  topEditor: editor.ICodeEditor | undefined;
  bottomEditor: editor.ICodeEditor | undefined;
  /** 参照元の式。分割表示でないときは undefined で、線は引かない。 */
  from: CodeRange | undefined;
  kind: JumpKind | undefined;
  /** 定義の識別子。無ければ線は引かない。 */
  anchor: SymbolLocation | undefined;
};

export type FlowConnectorPath = {
  d: string;
  end: { x: number; y: number };
  color: string;
};

type Point = { x: number; y: number };

/** エディタ内の位置をコンテナ座標に変換し、そのエディタの縦の範囲に収める。 */
function pointIn(
  editorInstance: editor.ICodeEditor,
  container: HTMLElement,
  lineNumber: number,
  column: number,
): Point | undefined {
  const dom = editorInstance.getDomNode();
  if (!dom) return undefined;
  const position = editorInstance.getScrolledVisiblePosition({
    lineNumber,
    column,
  });
  if (!position) return undefined;
  const editorRect = dom.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const x = editorRect.left - containerRect.left + position.left;
  const rawY =
    editorRect.top - containerRect.top + position.top + position.height / 2;
  const minY = editorRect.top - containerRect.top;
  const maxY = editorRect.bottom - containerRect.top;
  return { x, y: Math.min(Math.max(rawY, minY), maxY) };
}

export function useFlowConnector({
  container,
  topEditor,
  bottomEditor,
  from,
  kind,
  anchor,
}: FlowConnectorArgs): FlowConnectorPath | undefined {
  const [path, setPath] = useState<FlowConnectorPath | undefined>(undefined);

  useEffect(() => {
    if (!container || !topEditor || !bottomEditor || !from || !kind || !anchor) {
      setPath(undefined);
      return;
    }
    let frame: number | undefined;
    const compute = () => {
      frame = undefined;
      const start = pointIn(
        topEditor,
        container,
        from.endLine,
        from.endColumn ?? from.startColumn ?? 1,
      );
      const end = pointIn(
        bottomEditor,
        container,
        anchor.lineNumber,
        anchor.startColumn,
      );
      if (!start || !end) {
        setPath(undefined);
        return;
      }
      const sx = start.x + 6;
      const ex = end.x - 4;
      const dx = Math.max(40, Math.abs(ex - sx) * 0.5);
      setPath({
        d: `M${sx},${start.y} C${sx + dx},${start.y} ${ex - dx},${end.y} ${ex},${end.y}`,
        end: { x: ex, y: end.y },
        color: jumpColor(kind),
      });
    };
    const schedule = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(compute);
    };
    const listeners = [
      topEditor.onDidScrollChange(schedule),
      topEditor.onDidLayoutChange(schedule),
      bottomEditor.onDidScrollChange(schedule),
      bottomEditor.onDidLayoutChange(schedule),
      bottomEditor.onDidChangeHiddenAreas(schedule),
    ];
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    schedule();
    return () => {
      listeners.forEach((listener) => listener.dispose());
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [container, topEditor, bottomEditor, from, kind, anchor]);

  return path;
}
