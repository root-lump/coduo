// ワークスペース領域の語彙。
// snapshot payload に現れる型の正本は src/shared/snapshot/ であり、
// ここではそれを再輸出する。手書きの複製を作らないこと。

export type { ChangeStatus } from "../../shared/snapshot/ChangeStatus";
export type { ChangedFile } from "../../shared/snapshot/ChangedFile";
export type { ChangedLine } from "../../shared/snapshot/ChangedLine";
export type { ChangedLineKind } from "../../shared/snapshot/ChangedLineKind";
export type { FileReadability } from "../../shared/snapshot/FileReadability";
export type { RepositoryFile } from "../../shared/snapshot/RepositoryFile";
export type { RepositorySnapshot } from "../../shared/snapshot/RepositorySnapshot";
export type { SelectionKind } from "../../shared/snapshot/SelectionKind";
export type { WorkspaceSelection } from "../../shared/snapshot/WorkspaceSelection";

import type { FileContent as WireFileContent } from "../../shared/snapshot/FileContent";

/**
 * ビューアに表示するファイル内容。
 * wire で届く FileContent に、フロントエンドだけで付与する
 * 「表示できない理由」を加えたもの（Rust からは送られてこない）。
 */
export type FileContent = WireFileContent & {
  unavailableReason?: "binary" | "too-large" | "not-collected" | "error";
  unavailableMessage?: string;
};
