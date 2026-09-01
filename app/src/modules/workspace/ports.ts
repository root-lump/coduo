// workspace module が外界に要求する能力。実装は src/infrastructure/artifact。
import type { SymbolIndex } from "../../shared/snapshot/SymbolIndex";
import type { ChangedLine, FileContent, WorkspaceSelection } from "./domain";

export interface WorkspaceGateway {
  selectDirectory(): Promise<WorkspaceSelection | null>;
  selectFile(): Promise<WorkspaceSelection | null>;
  readFile(path: string): Promise<FileContent>;
  loadChangedLines(path: string): Promise<ChangedLine[]>;
  /** readable な全ファイルの本文。peek 表示用の model 事前生成に使う。 */
  listFileContents(): Promise<FileContent[]>;
  /** 収集時に作られた宣言索引。持たない payload では null。 */
  loadSymbolIndex(): Promise<SymbolIndex | null>;
}
