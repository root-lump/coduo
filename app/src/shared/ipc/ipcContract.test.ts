// IPC wire contract のフロントエンド側 characterization test。
// fixture は Rust serde の実出力（contract_tests.rs が保証）であり、
// ここでは「フロントエンドが受け取る形」としての不変条件を固定する。
// TypeScript の wire 型は生成物（src/shared/ipc/generated/）で、null の扱いを含め
// wire と一致する。JSON import はリテラル型が widen されるため、型レベルの
// satisfies 検証ではなく実行時検証で固定している。
import { describe, expect, it } from "vitest";
import type {
  AgentReviewResult,
  ReviewRequest,
} from "../../modules/review";
import directorySelection from "./fixtures/workspace_selection_directory.json";
import fileSelection from "./fixtures/workspace_selection_file.json";
import fileContent from "./fixtures/file_content.json";
import changedLines from "./fixtures/changed_lines.json";
import reviewResult from "./fixtures/agent_review_result.json";
import reviewError from "./fixtures/agent_review_error.json";
import reviewRequests from "./fixtures/review_requests.json";

describe("workspace selection の wire 形", () => {
  it("ディレクトリ選択では initialFile が null で届く（undefined ではない）", () => {
    expect(directorySelection.initialFile).toBeNull();
    expect(directorySelection.snapshot.selectionKind).toBe("directory");
    expect(directorySelection.snapshot.isGitRepository).toBe(true);
  });

  it("extension のない file は extension: null で届く", () => {
    const noExtension = directorySelection.snapshot.files.find(
      (file) => file.path === "logs/huge.log",
    );
    expect(noExtension?.extension).toBeNull();
  });

  it("readability は readable / binary / too-large の3値", () => {
    const values = directorySelection.snapshot.files.map(
      (file) => file.readability,
    );
    expect(values).toEqual(["readable", "binary", "too-large"]);
  });

  it("単一ファイル選択は branch: null / 空 changes / initialFile 同梱で届く", () => {
    expect(fileSelection.snapshot.branch).toBeNull();
    expect(fileSelection.snapshot.selectionKind).toBe("file");
    expect(fileSelection.snapshot.changes).toEqual([]);
    expect(fileSelection.initialFile?.path).toBe("memo.md");
  });

  it("FileContent の wire には unavailableReason 系のキーが存在しない", () => {
    // unavailableReason / unavailableMessage はフロントエンドが後付けする
    // ローカル拡張であり、Rust からは送られてこない。
    expect(Object.keys(fileContent).sort()).toEqual([
      "content",
      "language",
      "lineCount",
      "path",
    ]);
  });
});

describe("changed lines の wire 形", () => {
  it("kind は added / modified / deleted の3値", () => {
    expect(changedLines.map((line) => line.kind)).toEqual([
      "added",
      "modified",
      "deleted",
    ]);
  });
});

describe("review result / error の wire 形", () => {
  it("step は annotations を必ず配列で持つ（空でも省略されない）", () => {
    for (const step of reviewResult.tour.steps) {
      expect(Array.isArray(step.annotations)).toBe(true);
    }
  });

  it("step は target（null 可）と relation（null 可）を持つ", () => {
    const targets = reviewResult.tour.steps.map((step) => step.target);
    expect(targets[0]).not.toBeNull();
    expect(targets[targets.length - 1]).toBeNull();
    expect(reviewResult.tour.steps[1].relation).toBe("definition");
  });

  it("target には必ず range が入る", () => {
    for (const step of reviewResult.tour.steps) {
      if (step.target) {
        expect(step.target.range).toBeDefined();
      }
    }
  });

  it("エラーの usage / debug は null で届く", () => {
    expect(reviewError.usage).toBeNull();
    expect(reviewError.debug).toBeNull();
    expect(reviewError.agent).toBe("codex");
    expect(typeof reviewError.message).toBe("string");
  });

  it("result は現行 TS 型（optional の範囲内）として扱える", () => {
    // null → undefined の差を除けば互換であることの目印。
    const typed = reviewResult as unknown as AgentReviewResult;
    expect(typed.tour.steps.length).toBeGreaterThan(0);
  });
});

describe("フロントエンドが送る要求の wire 形", () => {
  it("ReviewRequest は kind タグ付きの3形", () => {
    const typed = reviewRequests as ReviewRequest[];
    expect(typed.map((request) => request.kind)).toEqual([
      "repository",
      "file",
      "pull_request",
    ]);
  });
});

