// @vitest-environment jsdom
// 注釈カードの描画テスト（見出し・Markdown 本文・選択とファイルリンクの切り分け）。
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodeAnnotation } from "../../review";
import { parseFileReference } from "../../workspace";
import { CodeAnnotationLayer } from "./CodeAnnotationLayer";

const files = new Set(["src/lib.rs", "src/main.rs"]);

const annotations: CodeAnnotation[] = [
  {
    id: "a-1",
    label: "公開関数",
    explanation: "**answer** は `src/main.rs:3` から呼ばれます。",
    target: { file: "src/lib.rs", range: { startLine: 1, endLine: 1 } },
  },
  {
    id: "a-2",
    label: "戻り値",
    explanation: "固定値を返します。",
    target: { file: "src/lib.rs", range: { startLine: 2, endLine: 2 } },
  },
];

function renderLayer() {
  const onSelect = vi.fn();
  const onOpenFileReference = vi.fn();
  render(
    <CodeAnnotationLayer
      anchors={[
        { id: "a-1", top: 40, visible: true },
        { id: "a-2", top: 80, visible: true },
      ]}
      annotations={annotations}
      height={600}
      width={800}
      onClose={() => undefined}
      onSelect={onSelect}
      resolveFileReference={(text) => parseFileReference(text, files)}
      onOpenFileReference={onOpenFileReference}
      selectedId="a-1"
    />,
  );
  return { onSelect, onOpenFileReference };
}

describe("CodeAnnotationLayer", () => {
  it("見出しと Markdown の本文を描画する", () => {
    renderLayer();
    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("strong")?.textContent).toBe("公開関数");
    expect(cards[0].querySelector(".code-annotation-body strong")?.textContent).toBe(
      "answer",
    );
  });

  it("カードと見出しボタンの click で注釈を選択する", () => {
    const { onSelect } = renderLayer();
    fireEvent.click(screen.getAllByTestId("code-annotation-card")[1]);
    expect(onSelect).toHaveBeenLastCalledWith("a-2");
    fireEvent.click(screen.getByRole("button", { name: /1\. 公開関数/ }));
    expect(onSelect).toHaveBeenLastCalledWith("a-1");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("本文のファイルリンクは参照を通知し、カードの選択には伝播しない", () => {
    const { onSelect, onOpenFileReference } = renderLayer();
    fireEvent.click(screen.getByRole("button", { name: "src/main.rs:3" }));
    expect(onOpenFileReference).toHaveBeenCalledWith({
      file: "src/main.rs",
      range: { startLine: 3, endLine: 3 },
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
