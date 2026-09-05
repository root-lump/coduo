// ジャンプの式にホバーしたとき、式の直下に出すタグ（Monaco の content widget）。
// content widget にするのは、Monaco が行の DOM を作り直しても位置が追従し、
// クリックを受けられるため。表示・非表示は useMonacoViewer がマウス位置で切り替える。
import type { editor } from "monaco-editor";
import { jumpLabel, type CodeJump } from "../../review";
import { monaco } from "../monacoEnvironment";

export type JumpTagWidget = {
  jump: CodeJump;
  show(): void;
  hide(): void;
  /** タグそのものの上にマウスがあるか（式から外れてもタグを消さないため）。 */
  isHovered(): boolean;
  dispose(): void;
};

export function createJumpTagWidget(
  editorInstance: editor.ICodeEditor,
  jump: CodeJump,
  onOpen: (jump: CodeJump) => void,
): JumpTagWidget {
  const { glyph, label } = jumpLabel(jump.kind);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `flow-jump-tag flow-kind-${jump.kind}`;
  button.textContent = `${glyph} ${label}`;
  button.title = `${jump.symbol} の定義へ`;
  let hovered = false;
  button.addEventListener("mouseenter", () => {
    hovered = true;
  });
  button.addEventListener("mouseleave", () => {
    hovered = false;
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onOpen(jump);
  });

  const { startLine, startColumn = 1 } = jump.from;
  const widget: editor.IContentWidget = {
    allowEditorOverflow: true,
    getId: () => `coduo.flow-jump-tag.${jump.id}`,
    getDomNode: () => button,
    getPosition: () => ({
      position: { lineNumber: startLine, column: startColumn },
      preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
    }),
  };
  let shown = false;
  return {
    jump,
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
