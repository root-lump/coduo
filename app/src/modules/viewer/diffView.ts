// 差分表示を出せるかの判定。ビューアのヘッダに切り替えを出すかを決める。

/** ビューアの表示モード。code は 1 画面、diff は変更前との差分。 */
export type ViewMode = "code" | "diff";

type DiffAvailability = {
  /** 復元した変更前の全文。復元できなかったファイルでは undefined。 */
  baseText?: string;
  /** 表示中の変更後の全文。 */
  headText?: string;
};

/**
 * 変更前を復元できていて、かつ変更後と実際に差があるときだけ差分表示を出す。
 * 差が無い場合に切り替えを出しても空の差分しか見えないため。
 */
export function shouldOfferDiff({
  baseText,
  headText,
}: DiffAvailability): boolean {
  if (baseText === undefined || headText === undefined) return false;
  return baseText !== headText;
}
