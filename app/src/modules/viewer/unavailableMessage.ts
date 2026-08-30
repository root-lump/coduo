import type { FileContent } from "../workspace";

/** 表示できないファイルの placeholder に出すメッセージを組み立てる。 */
export function unavailableMessageFor(file: FileContent): string {
  if (file.unavailableMessage) {
    return file.unavailableMessage;
  }
  switch (file.unavailableReason) {
    case "binary":
      return "バイナリファイルはコードビューアに表示できません。";
    case "too-large":
      return "このファイルはビューアの上限である2 MBを超えています。";
    case "not-collected":
      return "このファイルはスナップショットの収集範囲外です（ファイル名のみ収録）。";
    case "error":
      return "Coduoでこのファイルを読み込めませんでした。";
    default:
      return "このファイルは空です。";
  }
}
