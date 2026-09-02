// 出自の種別から、Tour 開始時のビューアの表示設定を決める。
// PR と作業ツリー（--diff）の Tour は変更行を読むステップが中心なので、
// 閲覧者が「変更前と比べる」「1 画面で見る」を押さずに済むよう
// 差分の 1 画面表示で始める。差分を出せないファイルでは表示側が
// コードモードへ落ちるため、変更の無い作業ツリーでも害は無い。
import type { CoduoSourceKind } from "../infrastructure/artifact/payload";
import type { ViewMode } from "../modules/viewer";

export type InitialView = {
  viewMode: ViewMode;
  renderSideBySide: boolean;
};

export function initialViewFor(kind: CoduoSourceKind): InitialView {
  switch (kind) {
    case "pull_request":
    case "local-directory":
      return { viewMode: "diff", renderSideBySide: false };
    case "repository":
    case "local-file":
      return { viewMode: "code", renderSideBySide: true };
  }
}
