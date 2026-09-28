// @vitest-environment jsdom
// 分割表示の段のヘッダーと折りたたみを実 DOM で確かめる。Monaco は jsdom で
// 動かないので描画しない（ヘッダーと grid の行定義は Monaco に依存しない）。
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeJump } from "../../review";
import type { FileContent } from "../../workspace";

vi.mock("@monaco-editor/react", () => ({
  default: () => null,
  DiffEditor: () => null,
}));
vi.mock("../monacoEnvironment", () => ({
  CODUO_THEME: "coduo-dark",
  monaco: { editor: { ScrollType: { Smooth: 0 } } },
}));

import { CodeViewer, type JumpView } from "./CodeViewer";

const fileOf = (path: string): FileContent => ({
  path,
  content: "fn a() {}\nfn b() {}\nfn c() {}\n",
  language: "rust",
  lineCount: 3,
});
const jumpOf = (id: string, file: string): CodeJump => ({
  id,
  kind: "callee",
  symbol: id,
  from: { startLine: 1, startColumn: 4, endLine: 1, endColumn: 5 },
  to: { file, range: { startLine: 2, endLine: 3 } },
  explanation: `${id} の定義。`,
});

const stepFile = fileOf("src/step.rs");
const middleFile = fileOf("src/middle.rs");
const targetFile = fileOf("src/target.rs");
const first = jumpOf("j1", middleFile.path);
const second = jumpOf("j2", targetFile.path);
const jumpView: JumpView = {
  path: [first, second],
  origins: [
    {
      depth: 0,
      file: stepFile,
      from: first.from,
      kind: first.kind,
      focus: { file: stepFile.path, range: { startLine: 1, endLine: 3 } },
      annotations: [],
      jumps: [first],
      changedLines: [],
    },
    {
      depth: 1,
      file: middleFile,
      from: second.from,
      kind: second.kind,
      focus: first.to,
      annotations: [],
      jumps: [second],
      changedLines: [],
    },
  ],
  kind: second.kind,
  rootLabel: "step.rs",
};

function viewerOf(
  view: JumpView | undefined,
  onOpenOriginJump = vi.fn(),
  file = targetFile,
) {
  return (
    <CodeViewer
      annotations={[]}
      changedLines={[]}
      file={file}
      focus={second.to}
      focusToken={1}
      isLoading={false}
      navigationFiles={[]}
      symbolIndex={null}
      onOpenLocation={vi.fn()}
      resolveFileReference={() => undefined}
      onOpenFileReference={vi.fn()}
      jumpToken={0}
      renderSideBySide={false}
      viewMode="code"
      jumps={[]}
      onOpenJump={vi.fn()}
      jumpView={view}
      onOpenOriginJump={onOpenOriginJump}
      onJumpBack={vi.fn()}
    />
  );
}

function renderViewer(onOpenOriginJump = vi.fn()) {
  render(viewerOf(jumpView, onOpenOriginJump));
  return onOpenOriginJump;
}

const headers = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>("button.flow-pane-bar"),
  );
const gridRows = () =>
  screen.getByTestId("code-viewer").style.gridTemplateRows;

describe("CodeViewer の分割表示", () => {
  it("上段 2 つと下段のヘッダーを深さの順に並べる", () => {
    renderViewer();
    expect(
      headers().map(
        (header) => header.querySelector(".flow-pane-path")?.textContent,
      ),
    ).toEqual([stepFile.path, middleFile.path, targetFile.path]);
  });

  it("ヘッダーのクリックで段を折りたたみ、もう一度で戻す", () => {
    renderViewer();
    const [top] = headers();
    expect(top?.getAttribute("aria-expanded")).toBe("true");
    expect(gridRows().split(" auto ")[1]).toBe("minmax(0, 45fr)");

    fireEvent.click(top!);
    expect(top?.getAttribute("aria-expanded")).toBe("false");
    expect(gridRows().split(" auto ")[1]).toBe("minmax(0, 0fr)");

    fireEvent.click(top!);
    expect(top?.getAttribute("aria-expanded")).toBe("true");
    expect(gridRows().split(" auto ")[1]).toBe("minmax(0, 45fr)");
  });

  it("ジャンプの列が縮んで下段になった深さは、畳んであっても最初の描画から展開で出す", () => {
    const { rerender } = render(viewerOf(jumpView));
    const middle = headers()[1]!;
    fireEvent.click(middle);
    expect(middle.getAttribute("aria-expanded")).toBe("false");

    // 最上段から別のジャンプを開き直すと、深さ 1 が下段になる。
    const third = jumpOf("j3", targetFile.path);
    const shallowView: JumpView = {
      ...jumpView,
      path: [third],
      origins: [{ ...jumpView.origins[0]!, from: third.from, jumps: [third] }],
      kind: third.kind,
    };
    const targetBar = headers()[2]!;
    // effect で直す前の描画も捕まえるため、属性の変化を全部記録する。
    const observer = new MutationObserver(() => {});
    observer.observe(targetBar, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
      attributeOldValue: true,
    });
    rerender(viewerOf(shallowView));
    const expandedHistory = [
      ...observer.takeRecords().map((record) => record.oldValue),
      targetBar.getAttribute("aria-expanded"),
    ];
    observer.disconnect();

    expect(headers().at(-1)).toBe(targetBar);
    expect(expandedHistory).not.toContain("false");
    // 外れた深さ 1 は縮み終わるまで 0fr で残り、下段は展開のまま 55fr で出る。
    expect(gridRows()).toBe(
      "auto auto minmax(0, 45fr) auto minmax(0, 0fr) auto minmax(0, 55fr)",
    );
  });

  it("ヘッダーの aria-controls が段ごとに一意な id で折りたたむ本体を指す", () => {
    renderViewer();
    const controls = headers().map((header) =>
      header.getAttribute("aria-controls"),
    );
    expect(new Set(controls).size).toBe(3);
    for (const [index, id] of controls.entries()) {
      const pane = document.getElementById(id!);
      expect(pane).not.toBeNull();
      expect(pane?.classList.contains("flow-pane-bar")).toBe(false);

      fireEvent.click(headers()[index]!);
      expect(pane?.classList.contains("is-collapsed")).toBe(true);
      fireEvent.click(headers()[index]!);
      expect(pane?.classList.contains("is-collapsed")).toBe(false);
    }
  });

  it("描画しただけでは上段のジャンプを開かない", () => {
    const onOpenOriginJump = renderViewer();
    expect(onOpenOriginJump).not.toHaveBeenCalled();
  });
});

describe("CodeViewer の段の入退場", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // jumpView から最下層のジャンプを 1 つ戻した列（上段は深さ 0 だけ）。
  const oneOriginView: JumpView = {
    ...jumpView,
    path: [first],
    origins: [jumpView.origins[0]!],
    kind: first.kind,
  };
  const veil = () => document.querySelector(".flow-target-veil");

  it("増えた段は最終的に 45fr で描かれ、ヘッダーに is-entering が残らない", () => {
    const { rerender } = render(viewerOf(oneOriginView));
    rerender(viewerOf(jumpView));

    expect(gridRows()).toBe(
      "auto auto minmax(0, 45fr) auto minmax(0, 45fr) auto minmax(0, 55fr)",
    );
    expect(headers()).toHaveLength(3);
    expect(
      headers().some((header) => header.classList.contains("is-entering")),
    ).toBe(false);
  });

  it("減った段は is-leaving で 0fr のまま残り、240ms 後に描画から外れる", () => {
    vi.useFakeTimers();
    const { rerender } = render(viewerOf(jumpView));
    rerender(viewerOf(oneOriginView));

    const leaving = headers()[1]!;
    expect(leaving.classList.contains("is-leaving")).toBe(true);
    expect(
      leaving.querySelector(".flow-pane-path")?.textContent,
    ).toBe(middleFile.path);
    expect(gridRows()).toBe(
      "auto auto minmax(0, 45fr) auto minmax(0, 0fr) auto minmax(0, 55fr)",
    );
    // 退場中の段と下段は同じ深さ 1 になるが、id は衝突させない。
    const ids = headers().map((header) => header.getAttribute("aria-controls"));
    expect(new Set(ids).size).toBe(ids.length);

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(headers()).toHaveLength(2);
    expect(document.querySelector(".is-leaving")).toBeNull();
    expect(gridRows()).toBe("auto auto minmax(0, 45fr) auto minmax(0, 55fr)");
  });

  it("jumpView が消えても退場中は分割表示が残り、240ms 後に 1 面に戻る", () => {
    vi.useFakeTimers();
    const { rerender } = render(viewerOf(jumpView));
    rerender(viewerOf(undefined));

    const shell = screen.getByTestId("code-viewer");
    expect(shell.classList.contains("code-viewer-split")).toBe(true);
    expect(
      headers()
        .slice(0, 2)
        .every((header) => header.classList.contains("is-leaving")),
    ).toBe(true);
    expect(gridRows()).toBe(
      "auto auto minmax(0, 0fr) auto minmax(0, 0fr) auto minmax(0, 55fr)",
    );

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(shell.classList.contains("code-viewer-split")).toBe(false);
    expect(headers()).toHaveLength(0);
    expect(gridRows()).toBe("");
  });

  it("3 段目のジャンプでは、退場する段を最初の描画で元の高さに残し、入場と同時に縮める", () => {
    const third = jumpOf("j3", "src/leaf.rs");
    const deepView: JumpView = {
      ...jumpView,
      path: [first, second, third],
      origins: [
        jumpView.origins[1]!,
        {
          depth: 2,
          file: targetFile,
          from: third.from,
          kind: third.kind,
          focus: second.to,
          annotations: [],
          jumps: [third],
          changedLines: [],
        },
      ],
      kind: third.kind,
    };
    const { rerender } = render(viewerOf(jumpView));
    const shell = screen.getByTestId("code-viewer");
    // jsdom では layout effect の再描画が同期に流れるので、確定した行定義を全部記録する。
    const observer = new MutationObserver(() => {});
    observer.observe(shell, {
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true,
    });
    rerender(viewerOf(deepView, vi.fn(), fileOf("src/leaf.rs")));
    const committedRows = observer
      .takeRecords()
      .map((record) => record.oldValue?.match(/grid-template-rows: ([^;]*)/)?.[1]);
    observer.disconnect();

    // 入場中の描画: 深さ 0（退場）は 45fr のまま、深さ 2（入場）だけ 0fr。
    expect(committedRows).toContain(
      "auto auto minmax(0, 45fr) auto minmax(0, 45fr) auto minmax(0, 0fr) auto minmax(0, 55fr)",
    );
    // 入場が確定した描画: track 数は同じまま、深さ 0 が 0fr、深さ 2 が 45fr。
    expect(gridRows()).toBe(
      "auto auto minmax(0, 0fr) auto minmax(0, 45fr) auto minmax(0, 45fr) auto minmax(0, 55fr)",
    );
  });

  it("下段のファイルが変わると幕を作り直す", () => {
    const { rerender } = render(viewerOf(jumpView));
    const before = veil();
    expect(before).not.toBeNull();

    rerender(viewerOf(jumpView));
    expect(veil()).toBe(before);

    rerender(viewerOf(jumpView, vi.fn(), fileOf("src/other.rs")));
    expect(veil()).not.toBeNull();
    expect(veil()).not.toBe(before);
  });
});
