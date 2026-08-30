// workspace module の公開 API。他 module はここ経由でのみ参照する。
export type {
  ChangeStatus,
  ChangedFile,
  ChangedLine,
  ChangedLineKind,
  FileContent,
  FileReadability,
  RepositoryFile,
  RepositorySnapshot,
  SelectionKind,
  WorkspaceSelection,
} from "./domain";
export type {
  WorkspaceGateway,
} from "./ports";
export {
  useWorkspace,
  type FileLoadState,
  type OpenedWorkspace,
  type WorkspacePhase,
} from "./application/useWorkspace";
export { ChangesPanel } from "./ui/ChangesPanel";
