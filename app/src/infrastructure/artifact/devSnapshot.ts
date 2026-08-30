// 開発・visual regression 用の固定 snapshot payload。
// データは IPC contract fixture（shared/ipc/fixtures/）を流用し、
// Skill が生成する payload と同じ形に組み立てる。
import type { AgentReviewResult } from "../../modules/review";
import type {
  ChangedLine,
  FileContent,
  WorkspaceSelection,
} from "../../modules/workspace";
import directorySelection from "../../shared/ipc/fixtures/workspace_selection_directory.json";
import fileContent from "../../shared/ipc/fixtures/file_content.json";
import changedLines from "../../shared/ipc/fixtures/changed_lines.json";
import reviewResult from "../../shared/ipc/fixtures/agent_review_result.json";
import type { CoduoSnapshotPayload } from "./payload";

const workspace = directorySelection as unknown as WorkspaceSelection;
const libRs = fileContent as FileContent;
const tour = reviewResult as unknown as AgentReviewResult;

export const devSnapshot: CoduoSnapshotPayload = {
  version: 1,
  source: {
    kind: "repository",
    name: "example/demo-repo",
    revision: "0000000000000000000000000000000000000000",
  },
  workspace,
  fileContents: {
    [libRs.path]: libRs,
  },
  changedLines: {
    [libRs.path]: changedLines as ChangedLine[],
  },
  tours: {
    repository: tour,
    pull_request: tour,
    [`file:${libRs.path}`]: tour,
  },
};
