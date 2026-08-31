import type { FileContent } from "./FileContent";
import type { RepositorySnapshot } from "./RepositorySnapshot";

export type WorkspaceSelection = {
  snapshot: RepositorySnapshot;
  initialFile: FileContent | null;
};
