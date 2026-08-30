// App 統合テスト用の fake gateway 群。
// データは IPC contract fixture（src/shared/ipc/fixtures/）を流用し、
// 「実際に wire を流れる形」でフロントエンドを駆動する。
// 注意: as 変換は JSON import でリテラル型が widen される（"directory" → string）
// ことへの対処であり、値そのものは生成型と一致する（契約テストが保証）。
import { vi } from "vitest";
import type { AppServices } from "../../app/composition";
import type {
  AgentReviewError,
  AgentReviewResult,
  ReviewGateway,
} from "../../modules/review";
import type {
  FileContent,
  WorkspaceGateway,
  WorkspaceSelection,
} from "../../modules/workspace";
import directorySelectionFixture from "../ipc/fixtures/workspace_selection_directory.json";
import fileSelectionFixture from "../ipc/fixtures/workspace_selection_file.json";
import fileContentFixture from "../ipc/fixtures/file_content.json";
import changedLinesFixture from "../ipc/fixtures/changed_lines.json";
import reviewResultFixture from "../ipc/fixtures/agent_review_result.json";
import reviewErrorFixture from "../ipc/fixtures/agent_review_error.json";

export const fixtures = {
  directorySelection:
    directorySelectionFixture as unknown as WorkspaceSelection,
  fileSelection: fileSelectionFixture as unknown as WorkspaceSelection,
  fileContent: fileContentFixture as FileContent,
  changedLines:
    changedLinesFixture as import("../../modules/workspace").ChangedLine[],
  reviewResult: reviewResultFixture as unknown as AgentReviewResult,
  reviewError: reviewErrorFixture as unknown as AgentReviewError,
};

/** 解決タイミングをテスト側で制御できる Promise。 */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const fakeWorkspaceGateway = {
  selectDirectory: vi.fn<WorkspaceGateway["selectDirectory"]>(),
  selectFile: vi.fn<WorkspaceGateway["selectFile"]>(),
  readFile: vi.fn<WorkspaceGateway["readFile"]>(),
  loadChangedLines: vi.fn<WorkspaceGateway["loadChangedLines"]>(),
} satisfies WorkspaceGateway;

export const fakeAgentGateway = {
  review: vi.fn<ReviewGateway["review"]>(),
  cancel: vi.fn<ReviewGateway["cancel"]>(),
} satisfies ReviewGateway;

/** 各テストの先頭で fake を既定の挙動へ戻す。 */
export function resetFakeGateways() {
  fakeWorkspaceGateway.selectDirectory
    .mockReset()
    .mockResolvedValue(fixtures.directorySelection);
  fakeWorkspaceGateway.selectFile
    .mockReset()
    .mockResolvedValue(fixtures.fileSelection);
  fakeWorkspaceGateway.readFile
    .mockReset()
    .mockResolvedValue(fixtures.fileContent);
  fakeWorkspaceGateway.loadChangedLines
    .mockReset()
    .mockResolvedValue(fixtures.changedLines);
  fakeAgentGateway.review.mockReset();
  fakeAgentGateway.cancel.mockReset().mockResolvedValue(undefined);
}

/** App にそのまま注入できる fake の AppServices。 */
export function fakeServices(): AppServices {
  return {
    workspaceGateway: fakeWorkspaceGateway,
    reviewGateway: fakeAgentGateway,
    webviewZoom: { apply: async () => {} },
  };
}
