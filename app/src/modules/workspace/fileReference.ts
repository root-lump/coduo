// Tour の説明文に書かれたファイル参照（`path` / `path:12` / `path:12-20`）の解釈。
// パスは snapshot に実在するものだけを受け付け、それ以外は参照として扱わない。
import type { CodeRange } from "../../shared/snapshot/CodeRange";

export type FileReference = {
  file: string;
  /** 行指定があるときだけ付く。列は持たない。 */
  range?: CodeRange;
};

const REFERENCE_PATTERN = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/;

export function parseFileReference(
  text: string,
  filePaths: ReadonlySet<string>,
): FileReference | undefined {
  const match = REFERENCE_PATTERN.exec(text.trim());
  if (!match) {
    return undefined;
  }
  const [, file, startText, endText] = match;
  if (!filePaths.has(file)) {
    return undefined;
  }
  if (startText === undefined) {
    return { file };
  }
  const startLine = Number(startText);
  const endLine = endText === undefined ? startLine : Number(endText);
  if (startLine < 1 || endLine < startLine) {
    return undefined;
  }
  return { file, range: { startLine, endLine } };
}
