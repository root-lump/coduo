// 分割表示で、上段の参照元の式と下段の定義の識別子を結ぶ線の座標を出す。
// 両エディタのスクロールとレイアウト、コンテナのサイズ変化に追従し、rAF でまとめて再計算する。
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import type { CodeRange, JumpKind } from "../../review";
import type { SymbolLocation } from "../codeNavigation";
import { jumpColor } from "../flowDecorations";
import { lineIsVisible } from "./visibleLines";
import { containerPoint, layoutScaleOf, type Point } from "./connectorGeometry";

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

/**
 * エディタ内の位置をコンテナ座標に変換する。
 * 行が可視範囲の外（仮想化で描画されていない）なら undefined。その行では
 * getScrolledVisiblePosition の横位置が取れず（-1 起点の値になる）、線の端が
 * 左端に張り付くため、線を引かない。
 */
function pointIn(
  editorInstance: editor.ICodeEditor,
  container: HTMLElement,
  lineNumber: number,
  column: number,
): Point | undefined {
  const dom = editorInstance.getDomNode();
  if (!dom) return undefined;
  if (!lineIsVisible(editorInstance.getVisibleRanges(), lineNumber)) {
    return undefined;
  }
  const position = editorInstance.getScrolledVisiblePosition({
    lineNumber,
    column,
  });
  if (!position) return undefined;
  const containerRect = container.getBoundingClientRect();
  return containerPoint({
    editorRect: dom.getBoundingClientRect(),
    containerRect,
    scale: layoutScaleOf(containerRect.width, container.offsetWidth),
    position,
  });
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
