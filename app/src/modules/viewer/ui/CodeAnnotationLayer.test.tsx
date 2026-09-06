// @vitest-environment jsdom
// 注釈カードの描画テスト（畳んだピルと開いたカード・Markdown 本文・選択の切り分け）。
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodeAnnotation } from "../../review";
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

function renderLayer(zoneIds = ["a-1", "a-2"], selectedId = "a-1") {
  const onSelect = vi.fn();
  const onOpenFileReference = vi.fn();
  const onMeasure = vi.fn();
  const zones: AnnotationViewZone[] = zoneIds.map((annotationId) => {
    const domNode = document.createElement("div");
    document.body.append(domNode);
    return { annotationId, domNode };
  });
  render(
    <CodeAnnotationLayer
      annotations={annotations}
      zones={zones}
      onMeasure={onMeasure}
      onClose={() => undefined}
      onSelect={onSelect}
      resolveFileReference={(text) => parseFileReference(text, files)}
      onOpenFileReference={onOpenFileReference}
      selectedId={selectedId}
    />,
  );
  return { onSelect, onOpenFileReference, onMeasure, zones };
}

describe("CodeAnnotationLayer", () => {
  it("zone の中へカードを描く", () => {
    const { zones } = renderLayer();

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards).toHaveLength(2);
    expect(zones[0].domNode.contains(cards[0])).toBe(true);
    expect(zones[1].domNode.contains(cards[1])).toBe(true);
  });

  it("選択中だけ本文を出し、非選択は見出しだけに畳む", () => {
    renderLayer();

    const cards = screen.getAllByTestId("code-annotation-card");
    expect(cards[0].className).toContain("is-selected");
    expect(cards[0].querySelector(".code-annotation-body strong")?.textContent).toBe(
      "answer",
    );
    expect(cards[1].className).toContain("is-collapsed");
    expect(cards[1].querySelector(".code-annotation-body")).toBeNull();
    expect(cards[1].querySelector("strong")?.textContent).toBe("戻り値");
  });

  it("zone の無い注釈は描かない", () => {
    renderLayer(["a-2"]);

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
