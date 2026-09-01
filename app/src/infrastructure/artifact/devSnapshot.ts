// 開発・visual regression 用の固定 snapshot payload。
// データは snapshot のサンプル（shared/snapshot/samples/）を流用し、
// Skill が生成する payload と同じ形に組み立てる。
import type { AgentReviewResult } from "../../modules/review";
import type {
  ChangedLine,
  FileContent,
  WorkspaceSelection,
} from "../../modules/workspace";
import directorySelection from "../../shared/snapshot/samples/workspace_selection_directory.json";
import fileContent from "../../shared/snapshot/samples/file_content.json";
import changedLines from "../../shared/snapshot/samples/changed_lines.json";
import reviewResult from "../../shared/snapshot/samples/agent_review_result.json";
import symbolIndexSample from "../../shared/snapshot/samples/symbol_index.json";
import type { SymbolIndex } from "../../shared/snapshot/SymbolIndex";
import type { CoduoSnapshotPayload } from "./payload";

const workspace = directorySelection as unknown as WorkspaceSelection;
const libRs = fileContent as FileContent;
const tour = reviewResult as unknown as AgentReviewResult;
const symbolIndex = symbolIndexSample as unknown as SymbolIndex;

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
  symbolIndex,
};
