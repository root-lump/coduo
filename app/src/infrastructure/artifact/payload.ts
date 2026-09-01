// Coduo snapshot payload の定義と読み込み。
// Artifact 生成 Skill（Claude Code 側）が `<script id="coduo-snapshot" type="application/json">`
// として埋め込む。Runtime は GitHub・network へ一切アクセスしない（Snapshot 方式の絶対条件）。
import type { AgentReviewResult } from "../../modules/review";
import type { SymbolIndex } from "../../shared/snapshot/SymbolIndex";
import type {
  ChangedLine,
  FileContent,
  WorkspaceSelection,
} from "../../modules/workspace";

export type CoduoSourceKind =
  | "repository"
  | "pull_request"
  | "local-directory"
  | "local-file";

export type CoduoSourceMeta = {
  kind: CoduoSourceKind;
  /** 表示名。GitHub なら `owner/repo`、ローカルならディレクトリ/ファイル名。 */
  name: string;
  /** 固定 revision。GitHub なら commit SHA、ローカルなら取得時刻等の識別子。 */
  revision: string;
  /** PR のときだけ base 側 SHA を持つ。 */
  baseRevision?: string;
  /** PR 番号（PR のときのみ）。 */
  pullNumber?: number;
};

/**
 * Tour の格納キー。
 * - "repository" / "pull_request": そのモードの事前生成 Tour
 * - `file:<path>`: 単独ファイルモードの Tour
 * D2 承認事項: Tour はビルド時に生成して埋め込み、再生成は会話経由で
 * Artifact ごと更新する。runtime での追加生成は行わない。
 */
export type TourKey = string;

export type CoduoSnapshotPayload = {
  version: 1;
  source: CoduoSourceMeta;
  workspace: WorkspaceSelection;
  /** path → 全文。readability が readable のファイルだけ持つ。 */
  fileContents: Record<string, FileContent>;
  /** path → 変更行。無いファイルは変更なし扱い。 */
  changedLines: Record<string, ChangedLine[]>;
  tours: Record<TourKey, AgentReviewResult>;
  /** コードナビゲーション用の宣言索引。古い payload には無い。 */
  symbolIndex?: SymbolIndex;
};

export const SNAPSHOT_SCRIPT_ID = "coduo-snapshot";

/** 埋め込み payload を読む。無ければ null（ビルド不備）。 */
export function loadEmbeddedSnapshot(): CoduoSnapshotPayload | null {
  const element = document.getElementById(SNAPSHOT_SCRIPT_ID);
  if (!element?.textContent) {
    return null;
  }
  try {
    const parsed = JSON.parse(element.textContent) as CoduoSnapshotPayload;
    if (parsed.version !== 1 || !parsed.workspace?.snapshot) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
