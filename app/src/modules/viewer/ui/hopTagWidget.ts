// 次のステップへ進む式にホバーしたとき、式の直下に出すタグ（Monaco の content widget）。
// content widget にするのは、Monaco が行の DOM を作り直しても位置が追従し、
// クリックを受けられるため。表示・非表示は useMonacoViewer がマウス位置で切り替える。
import type { editor } from "monaco-editor";
import { hopLabel } from "../../review";
import type { NextHop } from "../flowDecorations";
import { monaco } from "../monacoEnvironment";

type HopTagWidget = {
  show(): void;
  hide(): void;
  /** タグそのものの上にマウスがあるか（式から外れてもタグを消さないため）。 */
  isHovered(): boolean;
  dispose(): void;
};

export function createHopTagWidget(
  editorInstance: editor.ICodeEditor,
  hop: NextHop,
  onAdvance: () => void,
): HopTagWidget {
  const { glyph, label } = hopLabel(hop.kind);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `flow-hop-tag flow-kind-${hop.kind}`;
  button.textContent = `${glyph} ${label}`;
  button.title = "クリックで次のステップへ進む";
  let hovered = false;
  button.addEventListener("mouseenter", () => {
    hovered = true;
  });
  button.addEventListener("mouseleave", () => {
    hovered = false;
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onAdvance();
  });

  const { startLine, startColumn = 1 } = hop.target.range;
  const widget: editor.IContentWidget = {
    allowEditorOverflow: true,
    getId: () => `coduo.flow-hop-tag.${hop.target.file}:${startLine}`,
    getDomNode: () => button,
    getPosition: () => ({
      position: { lineNumber: startLine, column: startColumn },
      preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
    }),
  };
  let shown = false;
  return {
    show() {
      if (shown) return;
      shown = true;
      editorInstance.addContentWidget(widget);
    },
    hide() {
      if (!shown) return;
      shown = false;
      hovered = false;
      editorInstance.removeContentWidget(widget);
    },
    isHovered: () => hovered,
    dispose() {
      if (shown) editorInstance.removeContentWidget(widget);
      shown = false;
    },
  };
}
