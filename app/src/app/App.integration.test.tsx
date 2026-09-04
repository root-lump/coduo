// @vitest-environment jsdom
// App の主要状態遷移を fake の port 実装で固定する統合テスト。
// gateway は AppServices として注入する（モジュールモック不要）。
// Coduo ではローカルピッカーが無く、snapshot の展開と Tour の読み込みは
// 起動時に自動で行われる。
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act, type ComponentProps } from "react";
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
  CodeViewer: (props: {
    file?: { path: string };
    viewMode: string;
    renderSideBySide: boolean;
    jumpTarget?: { range: { startLine: number } };
    onOpenFileReference(reference: { file: string }): void;
    flowOrigin?: { origin: { file: string } };
    nextHop?: { target: { range: { startLine: number } } };
    onAdvanceHop(): void;
  }) => (
    <div
      data-testid="code-viewer"
      data-view-mode={props.viewMode}
      data-side-by-side={String(props.renderSideBySide)}
      data-jump-line={props.jumpTarget?.range.startLine}
      data-flow-origin={props.flowOrigin?.origin.file}
      data-next-hop-line={props.nextHop?.target.range.startLine}
    >
      {props.file?.path ?? "(ファイル未選択)"}
      {/* 注釈カードのファイルリンクの代わり。同じ経路で開けることを見る。 */}
      <button
        type="button"
        onClick={() => props.onOpenFileReference({ file: "assets/logo.png" })}
      >
        注釈からロゴを開く
      </button>
      {/* 次ホップの式をクリックする代わり。 */}
      <button type="button" onClick={() => props.onAdvanceHop()}>
        次ホップへ踏み込む
      </button>
    </div>
  ),
}));

const testSource = {
  kind: "repository",
  name: "example/demo-repo",
  revision: "0000000000000000000000000000000000000000",
} as const;

type RenderOptions = Partial<
  Pick<ComponentProps<typeof App>, "source" | "initialMode">
>;

function renderApp({
  source = testSource,
  initialMode = "repository",
}: RenderOptions = {}) {
  return render(
    <App services={fakeServices()} source={source} initialMode={initialMode} />,
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

describe("既定の表示モード", () => {
  it("PR の payload は差分の 1 画面表示で始まる", async () => {
    fakeWorkspaceGateway.loadPatch.mockResolvedValue(
      ["@@ -1,3 +1,3 @@", " pub fn answer() -> u32 {", "-    41", "+    42", " }"].join(
        "\n",
      ),
    );
    fakeAgentGateway.review.mockResolvedValue(fixtures.reviewResult);
    renderApp({
      source: {
        kind: "pull_request",
        name: "example/demo-repo",
        revision: "1111111111111111111111111111111111111111",
        baseRevision: "0000000000000000000000000000000000000000",
      },
      initialMode: "pull_request",
    });

    await screen.findByText("デモリポジトリのレビュー");
    // patch の読み込みが終わって差分を出せるようになると、切り替えボタンが出る。
    // 既定が 1 画面表示なので、2 つ目のボタンは「並べて見る」になる。
    await screen.findByRole("button", { name: "並べて見る" });
    const viewer = screen.getByTestId("code-viewer");
    expect(viewer.getAttribute("data-view-mode")).toBe("diff");
    expect(viewer.getAttribute("data-side-by-side")).toBe("false");
  });
});

describe("説明文のファイル参照", () => {
  const tourWithReferences: AgentReviewResult = {
    ...fixtures.reviewResult,
    tour: {
      ...fixtures.reviewResult.tour,
      steps: [
        {
          ...fixtures.reviewResult.tour.steps[0],
          explanation:
            "`assets/logo.png` は画像で、`src/lib.rs:2-3` が本体です。`src/missing.rs` は無い。",
        },
      ],
    },
  };

  it("行指定の無い参照はファイルを開き、探索中になる", async () => {
    fakeAgentGateway.review.mockResolvedValue(tourWithReferences);
    renderApp();
    await screen.findByText("デモリポジトリのレビュー");
    // 初期ステップのファイルが開き終わるのを待つ（開く途中で click すると、
    // 後から完了した初期ステップの読み込みが表示を上書きする）。
    await waitFor(() =>
      expect(screen.getByTestId("code-viewer").textContent).toContain(
        "src/lib.rs",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "assets/logo.png" }));
    await waitFor(() =>
      expect(screen.getByTestId("code-viewer").textContent).toContain(
        "assets/logo.png",
      ),
    );
    expect(screen.getByRole("button", { name: /レビューを再開/ })).toBeTruthy();
    // snapshot に無いパスはリンクにならない。
    expect(screen.queryByRole("button", { name: "src/missing.rs" })).toBeNull();
  });

  it("行指定のある参照はその位置へ移す", async () => {
    fakeAgentGateway.review.mockResolvedValue(tourWithReferences);
    renderApp();
    await screen.findByText("デモリポジトリのレビュー");
    // 初期ステップのファイルが開き終わるのを待つ（開く途中で click すると、
    // 後から完了した初期ステップの読み込みが表示を上書きする）。
    await waitFor(() =>
      expect(screen.getByTestId("code-viewer").textContent).toContain(
        "src/lib.rs",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "src/lib.rs:2-3" }));
    await waitFor(() => {
      const viewer = screen.getByTestId("code-viewer");
      expect(viewer.getAttribute("data-jump-line")).toBe("2");
      expect(viewer.textContent).toContain("src/lib.rs");
    });
  });

  it("注釈側からも同じ経路でファイルを開ける", async () => {
    fakeAgentGateway.review.mockResolvedValue(tourWithReferences);
    renderApp();
    await screen.findByText("デモリポジトリのレビュー");
    await waitFor(() =>
      expect(screen.getByTestId("code-viewer").textContent).toContain(
        "src/lib.rs",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "注釈からロゴを開く" }));
    await waitFor(() =>
      expect(screen.getByTestId("code-viewer").textContent).toContain(
        "assets/logo.png",
      ),
    );
  });
});

describe("処理の流れを追う（from）", () => {
  // fixture の step-2 は src/lib.rs:1 の `answer` から踏み込む from を持つ。
  const stepWithOrigin = fixtures.reviewResult.tour.steps[1];

  it("次ステップの from が今のファイルにあれば印が出て、進むと呼び出し元が上段に出る", async () => {
    fakeAgentGateway.review.mockResolvedValue(fixtures.reviewResult);
    renderApp();
    await screen.findByText("デモリポジトリのレビュー");
    const viewer = screen.getByTestId("code-viewer");
    await waitFor(() => expect(viewer.textContent).toContain("src/lib.rs"));

    // 1 ステップ目: 次ホップの印（2 ステップ目の from の行）だけが出る。
    await waitFor(() =>
      expect(viewer.getAttribute("data-next-hop-line")).toBe(
        String(stepWithOrigin.from?.range.startLine),
      ),
    );
    expect(viewer.getAttribute("data-flow-origin")).toBeNull();

    // 式をクリック（スタブのボタン）すると 2 ステップ目へ進み、from のファイルが上段に出る。
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "次ホップへ踏み込む" }));
    });
    expect(screen.getByTestId("current-explanation").textContent).toContain(
      "main から呼ばれます",
    );
    await waitFor(() =>
      expect(viewer.getAttribute("data-flow-origin")).toBe(
        stepWithOrigin.from?.file,
      ),
    );
    // バッジは from の種類で出る。
    expect(screen.getByText("踏み込む")).toBeTruthy();
    // 最後のステップなので次ホップは無い。
    expect(viewer.getAttribute("data-next-hop-line")).toBeNull();
  });

  it("探索中（手動でファイルを開いた後）は上段も印も消える", async () => {
    fakeAgentGateway.review.mockResolvedValue(fixtures.reviewResult);
    renderApp();
    await screen.findByText("デモリポジトリのレビュー");
    const viewer = screen.getByTestId("code-viewer");
    await waitFor(() =>
      expect(viewer.getAttribute("data-next-hop-line")).toBe("1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "注釈からロゴを開く" }));
    await waitFor(() => expect(viewer.textContent).toContain("assets/logo.png"));
    expect(viewer.getAttribute("data-next-hop-line")).toBeNull();
    expect(viewer.getAttribute("data-flow-origin")).toBeNull();
  });

  it("from の無いツアーでは上段も印も出ない", async () => {
    const plainTour: AgentReviewResult = {
      ...fixtures.reviewResult,
      tour: {
        ...fixtures.reviewResult.tour,
        steps: fixtures.reviewResult.tour.steps.map((step) => ({
          ...step,
          from: null,
        })),
      },
    };
    fakeAgentGateway.review.mockResolvedValue(plainTour);
    renderApp();
    await screen.findByText("デモリポジトリのレビュー");
    const viewer = screen.getByTestId("code-viewer");
    await waitFor(() => expect(viewer.textContent).toContain("src/lib.rs"));
    expect(viewer.getAttribute("data-next-hop-line")).toBeNull();
    expect(viewer.getAttribute("data-flow-origin")).toBeNull();
  });
});
