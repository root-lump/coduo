// 変更後の全文と unified diff から、変更前の全文を復元する。
// payload には変更前の本文を載せず patch だけを載せるため（容量を差分の分に抑える）、
// 差分表示に必要な変更前はビューア側でここから作る。

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const NO_NEWLINE_MARKER = "\\ No newline at end of file";

type Lines = { lines: string[]; endsWithNewline: boolean };

function splitLines(text: string): Lines {
  const endsWithNewline = text.endsWith("\n");
  const body = endsWithNewline ? text.slice(0, -1) : text;
  return { lines: body === "" ? [] : body.split("\n"), endsWithNewline };
}

function joinLines({ lines, endsWithNewline }: Lines): string {
  if (lines.length === 0) return "";
  return lines.join("\n") + (endsWithNewline ? "\n" : "");
}

/**
 * 変更後の全文に patch を逆適用して、変更前の全文を返す。
 * patch が変更後と食い違う（context 行・追加行が一致しない、hunk の範囲が
 * 変更後をはみ出す、hunk が前に戻る）ときは null を返す。呼び出し側は
 * null を「差分表示を出さない」と解釈し、崩れた差分を見せない。
 */
export function reconstructBaseText(
  headText: string,
  patch: string,
): string | null {
  const head = splitLines(headText);
  const base: string[] = [];
  // 変更後の何行目まで消費したか（0 起点）。
  let cursor = 0;
  // 「末尾に改行なし」が変更前の最終行に付いたときの、その時点の変更前の行数。
  let baseNoNewlineAt = -1;
  let previousKind: "context" | "added" | "deleted" | undefined;
  let inHunk = false;

  const patchLines = patch.split("\n");
  // git diff の出力は改行で終わるため末尾に空要素が残る。空の context 行は
  // " "（空白 1 文字）として現れるので、この空要素は行ではない。
  if (patchLines.at(-1) === "") patchLines.pop();

  for (const raw of patchLines) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      const newStart = Number(header[1]) - 1;
      if (newStart < cursor || newStart > head.lines.length) return null;
      base.push(...head.lines.slice(cursor, newStart));
      cursor = newStart;
      inHunk = true;
      previousKind = undefined;
      continue;
    }
    if (!inHunk) continue; // 最初の hunk より前の差分ヘッダは読み飛ばす

    if (raw === NO_NEWLINE_MARKER) {
      // 直前の行が変更前にも存在する種別（context / 削除）なら、変更前の末尾も改行なし。
      if (previousKind !== "added") baseNoNewlineAt = base.length;
      continue;
    }

    const marker = raw[0] ?? " ";
    const content = raw.slice(1);
    if (marker === "-") {
      base.push(content);
      previousKind = "deleted";
      continue;
    }
    // context 行と追加行はどちらも変更後に存在するので、一致を照合してから進む。
    if (marker !== " " && marker !== "+" && raw !== "") return null;
    if (cursor >= head.lines.length) return null;
    if (head.lines[cursor] !== (raw === "" ? "" : content)) return null;
    if (marker !== "+") base.push(head.lines[cursor]);
    cursor += 1;
    previousKind = marker === "+" ? "added" : "context";
  }

  const hasTail = cursor < head.lines.length;
  base.push(...head.lines.slice(cursor));
  return joinLines({
    lines: base,
    // hunk の後ろに変更後の行が残っていれば、末尾の改行は変更後と同じ。
    endsWithNewline:
      !hasTail && baseNoNewlineAt === base.length ? false : head.endsWithNewline,
  });
}
