import type { ChangeStatus } from "./ChangeStatus";
import type { ChangedLine } from "./ChangedLine";

export type ChangedFile = {
  path: string;
  status: ChangeStatus;
  staged: boolean;
  unstaged: boolean;
  changedLines: Array<ChangedLine>;
};
