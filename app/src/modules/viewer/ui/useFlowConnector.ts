// 分割表示で、上段の式（from）と下段の対象範囲を結ぶ線の座標を出す。
// 両エディタのスクロールとレイアウト、コンテナのサイズ変化に追従し、rAF でまとめて再計算する。
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import type { CodeTarget, StepOrigin } from "../../review";
import { hopColor } from "../flowDecorations";

type FlowConnectorArgs = {
  container: HTMLElement | null;
  topEditor: editor.ICodeEditor | undefined;
  bottomEditor: editor.ICodeEditor | undefined;
  /** 分割表示でないときは undefined。線は引かない。 */
  origin: StepOrigin | undefined;
  focus: CodeTarget | undefined;
};

export type FlowConnectorPath = { d: string; end: { x: number; y: number }; color: string };

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
  origin,
  focus,
}: FlowConnectorArgs): FlowConnectorPath | undefined {
  const [path, setPath] = useState<FlowConnectorPath | undefined>(undefined);

  useEffect(() => {
    if (!container || !topEditor || !bottomEditor || !origin || !focus) {
      setPath(undefined);
      return;
    }
    let frame: number | undefined;
    const compute = () => {
      frame = undefined;
      const from = pointIn(
        topEditor,
        container,
        origin.range.endLine,
        origin.range.endColumn ?? origin.range.startColumn ?? 1,
      );
      const to = pointIn(bottomEditor, container, focus.range.startLine, 1);
      if (!from || !to) {
        setPath(undefined);
        return;
      }
      const start = { x: from.x + 6, y: from.y };
      const dx = Math.max(40, Math.abs(to.x - start.x) * 0.5);
      setPath({
        d: `M${start.x},${start.y} C${start.x + dx},${start.y} ${to.x - dx},${to.y} ${to.x},${to.y}`,
        end: to,
        color: hopColor(origin.kind),
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
  }, [container, topEditor, bottomEditor, origin, focus]);

  return path;
}
