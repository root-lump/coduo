// @vitest-environment jsdom
// 注釈カードの描画テスト（見出し・Markdown 本文・選択とファイルリンクの切り分け）。
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("表示倍率が変わっても、カードは実際に占める高さの分だけ間を空ける", () => {
    // 倍率は documentElement の CSS zoom で変えるため、getBoundingClientRect は
    // スケール後の値を返す。それで積むとカードが重なる。
    const measured: Record<string, number> = { "a-1": 137, "a-2": 137 };
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return measured[this.dataset.annotationId ?? ""] ?? 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const height = (measured[this.dataset.annotationId ?? ""] ?? 0) * 0.8;
        return { height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0, toJSON: () => ({}) };
      },
    );

    renderLayer();

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards[0].style.top).toBe("18px");
    // 18 + 137 + 13。スケール後の 109.6 で積むと 140.6px になり、カードが重なる。
    expect(cards[1].style.top).toBe("168px");
  });

  it("選択が変わると、エディタが動かなくてもレールがそのカードへ寄る", () => {
    // エディタ上のクリックで選ぶ経路は reveal を伴わないので、アンカーも
    // カードの高さも動かない。それでも選択中のカードは表示域に入ってほしい。
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(137);
    const anchors = [
      { id: "a-1", top: 40, visible: true },
      { id: "a-2", top: 300, visible: true },
    ];
    const props = {
      anchors,
      annotations,
      height: 200,
      width: 800,
      onClose: () => undefined,
      onSelect: () => undefined,
      resolveFileReference: (text: string) => parseFileReference(text, files),
      onOpenFileReference: () => undefined,
    };
    const { container, rerender } = render(
      <CodeAnnotationLayer {...props} selectedId="a-1" />,
    );
    const rail = container.querySelector(".code-annotation-rail") as HTMLElement;
    expect(rail.scrollTop).toBe(0);

    rerender(<CodeAnnotationLayer {...props} selectedId="a-2" />);

    // a-2 の cardTop 231.5 から余白 18 を引いた 213.5 を、下端 186.5 に丸めた値。
    expect(rail.scrollTop).toBeCloseTo(186.5, 1);
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
