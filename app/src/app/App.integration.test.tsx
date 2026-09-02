// @vitest-environment jsdom
// App の主要状態遷移を fake の port 実装で固定する統合テスト。
// gateway は AppServices として注入する（モジュールモック不要）。
// Coduo ではローカルピッカーが無く、snapshot の展開と Tour の読み込みは
// 起動時に自動で行われる。
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  deferred,
  fakeAgentGateway,
  fakeServices,
  fakeWorkspaceGateway,
  fixtures,
  resetFakeGateways,
} from "../shared/test/fakeGateways";
import type { AgentReviewResult } from "../modules/review";

// Monaco は jsdom で動かないため、App レベルではファイルパスと表示モードだけ映す stub にする。
vi.mock("../modules/viewer/ui/CodeViewer", () => ({
  CodeViewer: (props: { file?: { path: string }; viewMode: string }) => (
    <div data-testid="code-viewer" data-view-mode={props.viewMode}>
      {props.file?.path ?? "(ファイル未選択)"}
    </div>
  ),
}));

const testSource = {
  kind: "repository",
  name: "example/demo-repo",
  revision: "0000000000000000000000000000000000000000",
} as const;

function renderApp() {
  return render(
    <App
      services={fakeServices()}
      source={testSource}
      initialMode="repository"
    />,
  );
}

beforeEach(() => {
  resetFakeGateways();
});

describe("起動とスナップショット展開", () => {
  it("snapshot が自動で開き、Tour が自動で読み込まれて表示される", async () => {
    const pending = deferred<AgentReviewResult>();
    fakeAgentGateway.review.mockReturnValue(pending.promise);
    renderApp();

    await screen.findAllByText("example/demo-repo");
    expect(fakeWorkspaceGateway.selectDirectory).toHaveBeenCalledTimes(1);
    // 変更ファイル一覧が出る。
    expect(screen.getAllByText("lib.rs").length).toBeGreaterThan(0);

    // Tour は自動で読み込みが始まる（対象選択 UI は存在しない）。
    await screen.findByText(/リポジトリの説明を読み込んでいます/);
    expect(fakeAgentGateway.review).toHaveBeenCalledTimes(1);
    expect(fakeAgentGateway.review.mock.calls[0][0]).toEqual({
      kind: "repository",
    });

    await act(async () => {
      pending.resolve(fixtures.reviewResult);
    });

    // ready: ツアーのタイトルとステップが表示される
    await screen.findByText("デモリポジトリのレビュー");
    expect(screen.getByTestId("current-explanation").textContent).toContain(
      "エントリポイント",
    );
  });

  it("snapshot 展開の失敗はエラートーストとして表示される", async () => {
    fakeWorkspaceGateway.selectDirectory.mockRejectedValue(
      new Error("選択したリポジトリを利用できませんでした"),
    );
    renderApp();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "選択したリポジトリを利用できませんでした",
    );
  });

  it("Tour の読み込み失敗は error 状態になり、再試行ボタンが出る", async () => {
    fakeAgentGateway.review.mockRejectedValue(fixtures.reviewError);
    renderApp();

    await screen.findByText("説明を表示できませんでした");
    expect(screen.getByText("Claude Code にログインしてください")).toBeTruthy();
    expect(screen.getByRole("button", { name: "再試行" })).toBeTruthy();
  });
});

describe("表示モード", () => {
  it("差分モードは Tour のステップを移動しても保たれる", async () => {
    // fixture の src/lib.rs（42 を返す）に逆適用できる hunk。変更前は 41 を返す。
    fakeWorkspaceGateway.loadPatch.mockResolvedValue(
      ["@@ -1,3 +1,3 @@", " pub fn answer() -> u32 {", "-    41", "+    42", " }"].join(
        "\n",
      ),
    );
    fakeAgentGateway.review.mockResolvedValue(fixtures.reviewResult);
    renderApp();

    await screen.findByText("デモリポジトリのレビュー");
    const viewer = screen.getByTestId("code-viewer");
    expect(viewer.getAttribute("data-view-mode")).toBe("code");

    fireEvent.click(
      await screen.findByRole("button", { name: /変更前と比べる/ }),
    );
    expect(viewer.getAttribute("data-view-mode")).toBe("diff");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "次のレビューステップ" }),
      );
    });
    expect(screen.getByTestId("current-explanation").textContent).toContain(
      "main から呼ばれます",
    );
    expect(viewer.getAttribute("data-view-mode")).toBe("diff");
  });
});
