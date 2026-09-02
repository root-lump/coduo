// @vitest-environment jsdom
// ReviewSession の描画テスト（再開カード・劣化警告・説明経路）。
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewTour } from "../domain";
import { parseFileReference } from "../../workspace";
import { ReviewSession } from "./ReviewSession";

const tour: ReviewTour = {
  title: "サンプルのレビュー",
  summary: "全体の流れを追います。",
  steps: [
    {
      id: "step-1",
      title: "概観",
      explanation: "目的の説明",
      target: null,
      relation: null,
      annotations: [],
    },
    {
      id: "step-2",
      title: "中核処理",
      explanation: "**中核** の説明。`src/core.rs:2-4` を見ます。",
      target: {
        file: "src/core.rs",
        range: { startLine: 1, endLine: 5 },
      },
      relation: "definition",
      annotations: [],
    },
  ],
};

function renderSession(
  overrides: Partial<Parameters<typeof ReviewSession>[0]> = {},
) {
  const onResume = vi.fn();
  const onSelectStep = vi.fn();
  const onOpenFileReference = vi.fn();
  const files = new Set(["src/core.rs"]);
  render(
    <ReviewSession
      tour={tour}
      currentStepIndex={1}
      explanation={undefined}
      relation="definition"
      isExploring={false}
      mode="repository"
      warnings={[]}
      resolveFileReference={(text) => parseFileReference(text, files)}
      onOpenFileReference={onOpenFileReference}
      onResume={onResume}
      onSelectStep={onSelectStep}
      {...overrides}
    />,
  );
  return { onResume, onSelectStep, onOpenFileReference };
}

describe("ReviewSession", () => {
  it("現在ステップと説明経路を表示し、ステップ選択を通知する", () => {
    const { onSelectStep } = renderSession();
    expect(screen.getByText("サンプルのレビュー")).toBeTruthy();
    expect(screen.getByTestId("current-explanation").textContent).toContain(
      "中核処理",
    );
    // 概観ステップはファイルを持たないためコンテキスト表記になる。
    expect(screen.getByText("コードコンテキスト")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /概観/ }));
    expect(onSelectStep).toHaveBeenCalledWith(0);
  });

  it("探索中でフォーカスがあるステップでは再開カードを出す", () => {
    const { onResume } = renderSession({ isExploring: true });
    fireEvent.click(screen.getByRole("button", { name: /レビューを再開/ }));
    expect(onResume).toHaveBeenCalled();
  });

  it("フォーカスのない概観ステップでは再開カードを出さない", () => {
    renderSession({ isExploring: true, currentStepIndex: 0 });
    expect(screen.queryByRole("button", { name: /レビューを再開/ })).toBeNull();
  });

  it("説明文を Markdown として描画し、ファイル参照の click を通知する", () => {
    const { onOpenFileReference } = renderSession();
    const explanation = screen.getByTestId("current-explanation");
    expect(explanation.querySelector(".step-explanation strong")?.textContent).toBe(
      "中核",
    );
    fireEvent.click(screen.getByRole("button", { name: "src/core.rs:2-4" }));
    expect(onOpenFileReference).toHaveBeenCalledWith({
      file: "src/core.rs",
      range: { startLine: 2, endLine: 4 },
    });
  });

  it("注釈修復の劣化警告を表示する", () => {
    renderSession({
      warnings: ["claude-2 にコード注釈を付け直せませんでした。"],
    });
    expect(screen.getByRole("note").textContent).toContain(
      "claude-2 にコード注釈を付け直せませんでした。",
    );
  });
});
