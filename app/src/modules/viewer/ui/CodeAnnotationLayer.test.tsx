// @vitest-environment jsdom
// 注釈カードの描画テスト（既定で開く・手で畳む・下の行の色・選択の切り分け）。
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodeAnnotation } from "../../review";
import type { ChangedLine } from "../../workspace";
import { parseFileReference } from "../../workspace";
import { CodeAnnotationLayer } from "./CodeAnnotationLayer";
import type { AnnotationViewZone } from "./useAnnotationViewZones";

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

type RenderOptions = {
  zoneIds?: string[];
  selectedId?: string;
  changedLines?: ChangedLine[];
  cards?: CodeAnnotation[];
};

function renderLayer({
  zoneIds = ["a-1", "a-2"],
  selectedId = "a-1",
  changedLines = [],
  cards = annotations,
}: RenderOptions = {}) {
  const onSelect = vi.fn();
  const onOpenFileReference = vi.fn();
  const onMeasure = vi.fn();
  const zones: AnnotationViewZone[] = zoneIds.map((annotationId) => {
    const domNode = document.createElement("div");
    document.body.append(domNode);
    return { annotationId, domNode };
  });
  const view = render(
    <CodeAnnotationLayer
      annotations={cards}
      zones={zones}
      changedLines={changedLines}
      onMeasure={onMeasure}
      onClose={() => undefined}
      onSelect={onSelect}
      resolveFileReference={(text) => parseFileReference(text, files)}
      onOpenFileReference={onOpenFileReference}
      selectedId={selectedId}
    />,
  );
  return { onSelect, onOpenFileReference, onMeasure, zones, view };
}

const bodyOf = (card: HTMLElement) =>
  card.querySelector(".code-annotation-body");

describe("CodeAnnotationLayer", () => {
  it("zone の中へカードを描く", () => {
    const { zones } = renderLayer();

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards).toHaveLength(2);
    expect(zones[0].domNode.contains(cards[0])).toBe(true);
    expect(zones[1].domNode.contains(cards[1])).toBe(true);
  });

  it("既定ではすべてのカードの本文が出ている", () => {
    renderLayer();

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(bodyOf(cards[0])?.querySelector("strong")?.textContent).toBe(
      "answer",
    );
    expect(bodyOf(cards[1])?.textContent).toBe("固定値を返します。");
    expect(cards.every((card) => !card.className.includes("is-collapsed"))).toBe(
      true,
    );
  });

  it("折り畳みボタンで本文を出し入れし、選択は動かさない", () => {
    const { onSelect } = renderLayer();

    fireEvent.click(screen.getAllByRole("button", { name: "本文を畳む" })[0]);

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(bodyOf(cards[0])).toBeNull();
    expect(cards[0].className).toContain("is-collapsed");
    // 残りのカードは開いたまま。
    expect(bodyOf(cards[1])).not.toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "本文を開く" })[0]);
    expect(bodyOf(screen.getAllByTestId("code-annotation-card")[0])).not.toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("注釈が入れ替わったら、また全部開いた状態に戻す", () => {
    const { view } = renderLayer();
    fireEvent.click(screen.getAllByRole("button", { name: "本文を畳む" })[0]);
    expect(bodyOf(screen.getAllByTestId("code-annotation-card")[0])).toBeNull();

    const next: CodeAnnotation[] = [
      { ...annotations[0], id: "b-1" },
      { ...annotations[1], id: "b-2" },
    ];
    const zones: AnnotationViewZone[] = ["b-1", "b-2"].map((annotationId) => {
      const domNode = document.createElement("div");
      document.body.append(domNode);
      return { annotationId, domNode };
    });
    view.rerender(
      <CodeAnnotationLayer
        annotations={next}
        zones={zones}
        changedLines={[]}
        onMeasure={() => undefined}
        onClose={() => undefined}
        onSelect={() => undefined}
        resolveFileReference={(text) => parseFileReference(text, files)}
        onOpenFileReference={() => undefined}
        selectedId="b-1"
      />,
    );

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards.every((card) => bodyOf(card) !== null)).toBe(true);
  });

  it("ブロックの先頭行の変更種別をカードに付ける", () => {
    renderLayer({ changedLines: [{ line: 1, kind: "added" }] });

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards[0].className).toContain("is-added");
    expect(cards[1].className).not.toContain("is-added");
  });

  it("選択中のカードは縁で示すだけで、本文の出し入れには関わらない", () => {
    renderLayer();

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards[0].className).toContain("is-selected");
    expect(cards[1].className).not.toContain("is-selected");
    expect(bodyOf(cards[1])).not.toBeNull();
  });

  it("zone の無い注釈は描かない", () => {
    renderLayer({ zoneIds: ["a-2"] });

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.annotationId).toBe("a-2");
  });

  it("カードと見出しボタンの click で注釈を選択する", () => {
    const { onSelect } = renderLayer();

    fireEvent.click(screen.getAllByTestId("code-annotation-card")[1]);
    expect(onSelect).toHaveBeenLastCalledWith("a-2");
    fireEvent.click(screen.getByRole("button", { name: /1\. 公開関数/ }));
    expect(onSelect).toHaveBeenLastCalledWith("a-1");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("カードの実測高さを zone へ返す", async () => {
    // 計測は次のフレームで行う（効果の時点では Monaco が zone を繋いでおらず 0 になる）。
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.dataset.annotationId === "a-1" ? 210 : 34;
      },
    );

    const { onMeasure } = renderLayer();

    await waitFor(() => expect(onMeasure).toHaveBeenCalledWith("a-1", 210));
    expect(onMeasure).toHaveBeenCalledWith("a-2", 34);
    vi.restoreAllMocks();
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
