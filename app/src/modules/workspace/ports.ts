// workspace module が外界に要求する能力。実装は src/infrastructure/artifact。
import type { ChangedLine, FileContent, WorkspaceSelection } from "./domain";

export interface WorkspaceGateway {
  selectDirectory(): Promise<WorkspaceSelection | null>;
  selectFile(): Promise<WorkspaceSelection | null>;
  readFile(path: string): Promise<FileContent>;
  loadChangedLines(path: string): Promise<ChangedLine[]>;
}
