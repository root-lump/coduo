// Snapshot payload を module の port へ写す adapter 群。
// application / ui はここから注入された port しか知らない。
import type {
  AgentReviewError,
  AgentReviewResult,
  ReviewGateway,
  ReviewRequest,
} from "../../modules/review";
import type {
  ChangedLine,
  FileContent,
  WorkspaceGateway,
  WorkspaceSelection,
} from "../../modules/workspace";
import type { WebviewZoom } from "../../modules/zoom";
import type { CoduoSnapshotPayload } from "./payload";

/** 生成 feedback（generating 状態）を知覚できる最小の待ち時間。 */
const GENERATION_FEEDBACK_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function tourKeyFor(request: ReviewRequest): string {
  return request.kind === "file" ? `file:${request.path}` : request.kind;
}

export function createSnapshotWorkspaceGateway(
  payload: CoduoSnapshotPayload,
): WorkspaceGateway {
  const selection = (): WorkspaceSelection =>
    structuredClone(payload.workspace);
  return {
    selectDirectory: async () => selection(),
    selectFile: async () => selection(),
    async readFile(path: string): Promise<FileContent> {
      const file = payload.fileContents[path];
      if (!file) {
        // readability 情報は snapshot 側にあり、UI が理由表示を組み立てる。
        // ここに無い readable ファイルは snapshot 生成の不備。
        throw new Error(
          `このファイルはスナップショットに含まれていません: ${path}`,
        );
      }
      return structuredClone(file);
    },
    async loadChangedLines(path: string): Promise<ChangedLine[]> {
      return structuredClone(payload.changedLines[path] ?? []);
    },
    async listFileContents(): Promise<FileContent[]> {
      const paths = Object.keys(payload.fileContents).sort();
      return paths.map((path) => structuredClone(payload.fileContents[path]));
    },
  };
}

export function createSnapshotReviewGateway(
  payload: CoduoSnapshotPayload,
): ReviewGateway {
  return {
    async review(request): Promise<AgentReviewResult> {
      await sleep(GENERATION_FEEDBACK_MS);
      const tour = payload.tours[tourKeyFor(request)];
      if (!tour) {
        const error: AgentReviewError = {
          agent: "claude",
          code: "unavailable_file",
          message:
            "この対象の説明はまだ生成されていません。Claude との会話でこのスナップショットの再生成を依頼してください。",
        };
        throw error;
      }
      return structuredClone(tour);
    },
    async cancel(): Promise<void> {
      // 埋め込み Tour の読み出しに中断すべき処理はない。
      // stale 破棄は application 層の requestId 照合が行う。
    },
  };
}

/** ブラウザ環境の zoom。document 直下の CSS zoom を使う（D4 承認済み）。 */
export const cssZoom: WebviewZoom = {
  async apply(level: number) {
    (
      document.documentElement.style as CSSStyleDeclaration & { zoom: string }
    ).zoom = String(level);
  },
};
