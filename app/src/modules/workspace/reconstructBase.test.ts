import { describe, expect, it } from "vitest";
import { reconstructBaseText } from "./reconstructBase";

/** テストの読みやすさのため、行配列から末尾改行付きのテキストを作る。 */
const text = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("reconstructBaseText", () => {
  it("追加だけの hunk から、追加行を取り除いた変更前を返す", () => {
    const head = text("const a = 1;", "const b = 2;", "const c = 3;");
    const patch = [
      "@@ -1,2 +1,3 @@",
      " const a = 1;",
      "+const b = 2;",
      " const c = 3;",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe(
      text("const a = 1;", "const c = 3;"),
    );
  });

  it("削除だけの hunk から、削除行を戻した変更前を返す", () => {
    const head = text("const a = 1;", "const c = 3;");
    const patch = [
      "@@ -1,3 +1,2 @@",
      " const a = 1;",
      "-const b = 2;",
      " const c = 3;",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe(
      text("const a = 1;", "const b = 2;", "const c = 3;"),
    );
  });

  it("置き換えの hunk で、削除行と追加行を入れ替える", () => {
    const head = text("const a = 1;", "const b = 20;", "const c = 3;");
    const patch = [
      "@@ -1,3 +1,3 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 20;",
      " const c = 3;",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe(
      text("const a = 1;", "const b = 2;", "const c = 3;"),
    );
  });

  it("複数の hunk を順に逆適用し、hunk の外は変更後のまま残す", () => {
    const head = text("a", "B", "c", "d", "e", "F", "g");
    const patch = [
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+B",
      " c",
      "@@ -5,3 +5,3 @@",
      " e",
      "-f",
      "+F",
      " g",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe(
      text("a", "b", "c", "d", "e", "f", "g"),
    );
  });

  it("空行の context 行を保つ", () => {
    const head = text("a", "", "C");
    const patch = ["@@ -1,3 +1,3 @@", " a", " ", "-c", "+C"].join("\n");

    expect(reconstructBaseText(head, patch)).toBe(text("a", "", "c"));
  });

  it("変更後に末尾改行が無い場合、その状態を変更前にも引き継ぐ", () => {
    const head = "a\nB";
    const patch = [
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "+B",
      "\\ No newline at end of file",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe("a\nb");
  });

  it("変更前だけ末尾改行が無い場合、変更前を改行なしで返す", () => {
    const head = text("a", "b");
    const patch = [
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "\\ No newline at end of file",
      "+b",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe("a\nb");
  });

  it("差分ヘッダが付いていても、最初の hunk から読む", () => {
    const head = text("a", "B");
    const patch = [
      "diff --git a/x.ts b/x.ts",
      "index 1111111..2222222 100644",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "+B",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBe(text("a", "b"));
  });

  it("patch が改行で終わっていても読める（git diff の出力そのまま）", () => {
    const head = text("a", "B");
    const patch = `${["@@ -1,2 +1,2 @@", " a", "-b", "+B"].join("\n")}\n`;

    expect(reconstructBaseText(head, patch)).toBe(text("a", "b"));
  });

  it("patch が空なら変更後をそのまま返す", () => {
    expect(reconstructBaseText(text("a"), "")).toBe(text("a"));
  });

  it("context 行が変更後と食い違うときは null を返す", () => {
    const head = text("a", "B", "c");
    const patch = ["@@ -1,3 +1,3 @@", " x", "-b", "+B", " c"].join("\n");

    expect(reconstructBaseText(head, patch)).toBeNull();
  });

  it("追加行が変更後と食い違うときは null を返す", () => {
    const head = text("a", "B", "c");
    const patch = ["@@ -1,3 +1,3 @@", " a", "-b", "+X", " c"].join("\n");

    expect(reconstructBaseText(head, patch)).toBeNull();
  });

  it("hunk が変更後の行数を超えるときは null を返す", () => {
    const head = text("a");
    const patch = ["@@ -1,3 +1,3 @@", " a", " b", " c"].join("\n");

    expect(reconstructBaseText(head, patch)).toBeNull();
  });

  it("hunk の開始行が前の hunk より前に戻るときは null を返す", () => {
    const head = text("a", "b", "c");
    const patch = [
      "@@ -3,1 +3,1 @@",
      " c",
      "@@ -1,1 +1,1 @@",
      " a",
    ].join("\n");

    expect(reconstructBaseText(head, patch)).toBeNull();
  });
});
