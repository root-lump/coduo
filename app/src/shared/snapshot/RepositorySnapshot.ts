import type { ChangedFile } from "./ChangedFile";
import type { RepositoryFile } from "./RepositoryFile";
import type { SelectionKind } from "./SelectionKind";

export type RepositorySnapshot = {
  root: string;
  name: string;
  selectionKind: SelectionKind;
  branch: string | null;
  isGitRepository: boolean;
  files: Array<RepositoryFile>;
  changes: Array<ChangedFile>;
};
