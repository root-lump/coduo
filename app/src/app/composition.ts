// アプリの配線。具象 adapter（Artifact snapshot 実装）を選ぶのはここだけ。
// module の application はここから注入された port しか知らない。
import type { ReviewGateway } from "../modules/review";
import type { WorkspaceGateway } from "../modules/workspace";
import type { WebviewZoom } from "../modules/zoom";
import {
  createSnapshotReviewGateway,
  createSnapshotWorkspaceGateway,
  cssZoom,
} from "../infrastructure/artifact/gateways";
import type { CoduoSnapshotPayload } from "../infrastructure/artifact/payload";

export type AppServices = {
  workspaceGateway: WorkspaceGateway;
  reviewGateway: ReviewGateway;
  webviewZoom: WebviewZoom;
};

export function snapshotServices(payload: CoduoSnapshotPayload): AppServices {
  return {
    workspaceGateway: createSnapshotWorkspaceGateway(payload),
    reviewGateway: createSnapshotReviewGateway(payload),
    webviewZoom: cssZoom,
  };
}
