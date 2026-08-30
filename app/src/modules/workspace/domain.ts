// ワークスペース領域の語彙。
// IPC を流れる wire 型の正本は生成物（src/shared/ipc/generated/）であり、
// ここではそれを再輸出する。手書きの複製を作らないこと。

export type { ChangeStatus } from "../../shared/ipc/generated/ChangeStatus";
export type { ChangedFile } from "../../shared/ipc/generated/ChangedFile";
export type { ChangedLine } from "../../shared/ipc/generated/ChangedLine";
export type { ChangedLineKind } from "../../shared/ipc/generated/ChangedLineKind";
export type { FileReadability } from "../../shared/ipc/generated/FileReadability";
export type { RepositoryFile } from "../../shared/ipc/generated/RepositoryFile";
export type { RepositorySnapshot } from "../../shared/ipc/generated/RepositorySnapshot";
export type { SelectionKind } from "../../shared/ipc/generated/SelectionKind";
export type { WorkspaceSelection } from "../../shared/ipc/generated/WorkspaceSelection";

import type { FileContent as WireFileContent } from "../../shared/ipc/generated/FileContent";

/**
 * ビューアに表示するファイル内容。
 * wire で届く FileContent に、フロントエンドだけで付与する
 * 「表示できない理由」を加えたもの（Rust からは送られてこない）。
 */
export type FileContent = WireFileContent & {
  unavailableReason?: "binary" | "too-large" | "not-collected" | "error";
  unavailableMessage?: string;
};
