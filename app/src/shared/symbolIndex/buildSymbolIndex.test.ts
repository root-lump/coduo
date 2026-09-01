// 収集スクリプトの索引生成（skills/create-code-tour/scripts/symbol-index.mjs）を、
// app のテスト環境から回す。文法 wasm と tags クエリの組み合わせが壊れると、
// fixture の期待宣言との差分としてここで落ちる。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error 収集スクリプトは型定義を持たない素の ESM
import { buildSymbolIndex } from "../../../../skills/create-code-tour/scripts/symbol-index.mjs";

type Declaration = [number, number, number, number, number];

type Index = {
  degraded: boolean;
  kinds: string[];
  paths: string[];
  symbols: Array<{
    name: string;
    declarations: Declaration[];
    occurrences: Array<[number, number, number]>;
  }>;
};

const skillRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../skills/create-code-tour",
);
const fixturesDir = join(skillRoot, "scripts/fixtures");
const assetsDir = join(skillRoot, "assets/tree-sitter");

const expected: Record<string, string[]> = JSON.parse(
  readFileSync(join(fixturesDir, "expected.json"), "utf8"),
);
const fixtureNames = Object.keys(expected).filter((key) => !key.startsWith("_"));

/** fixture のファイル名先頭が言語 ID。TSX だけは Monaco 上も typescript 扱い。 */
function languageOf(name: string): string {
  const id = name.split(".")[0];
  return id === "tsx" ? "typescript" : id;
}

function fixtureContents(names: string[]) {
  return Object.fromEntries(
    names.map((name) => [
      name,
      {
        content: readFileSync(join(fixturesDir, name), "utf8"),
        language: languageOf(name),
      },
    ]),
  );
}

function declarationsByPath(index: Index): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const symbol of index.symbols) {
    for (const [pathIdx, , , , kindIdx] of symbol.declarations) {
      const path = index.paths[pathIdx];
      (result[path] ??= []).push(`${symbol.name}:${index.kinds[kindIdx]}`);
    }
  }
  for (const path of Object.keys(result)) {
    result[path].sort();
  }
  return result;
}

describe("buildSymbolIndex", () => {
  it("fixture から期待どおりの宣言を抽出する", async () => {
    const { index } = (await buildSymbolIndex(fixtureContents(fixtureNames), {
      assetsDir,
    })) as { index: Index };
    expect(declarationsByPath(index)).toEqual(expected2Sorted());
  });

  it("行と列を 1 始まりで返す", async () => {
    const { index } = (await buildSymbolIndex(fixtureContents(["go.go"]), {
      assetsDir,
    })) as { index: Index };
    const source = readFileSync(join(fixturesDir, "go.go"), "utf8").split("\n");
    const store = index.symbols.find((symbol) => symbol.name === "Store");
    const [, lineNumber, startColumn, endColumn] = store!.declarations[0];
    expect(source[lineNumber - 1].slice(startColumn - 1, endColumn - 1)).toBe("Store");
  });

  it("非 ASCII を含む行でも列がずれない", async () => {
    const line = "/* 日本語 */ func Sample() {}";
    const content = `package sample\n\n${line}\n`;
    const { index } = (await buildSymbolIndex(
      { "enc.go": { content, language: "go" } },
      { assetsDir },
    )) as { index: Index };
    const sample = index.symbols.find((symbol) => symbol.name === "Sample");
    const [, lineNumber, startColumn] = sample!.declarations[0];
    expect(lineNumber).toBe(3);
    expect(startColumn).toBe(line.indexOf("Sample") + 1);
  });

  it("宣言のある名前だけ出現位置を持つ", async () => {
    const { index } = (await buildSymbolIndex(fixtureContents(["go.go"]), {
      assetsDir,
    })) as { index: Index };
    expect(index.symbols.every((symbol) => symbol.declarations.length > 0)).toBe(true);
    const store = index.symbols.find((symbol) => symbol.name === "Store");
    // 型宣言 1 件、レシーバ 1 件、複合リテラル 1 件、戻り値型 1 件。
    expect(store!.occurrences.length).toBeGreaterThan(1);
  });

  it("予算を超えると出現位置を落として degraded を立てる", async () => {
    const { index, stats } = (await buildSymbolIndex(fixtureContents(fixtureNames), {
      assetsDir,
      budgetBytes: 500,
    })) as { index: Index; stats: { degraded: boolean } };
    expect(index.degraded).toBe(true);
    expect(stats.degraded).toBe(true);
    expect(index.symbols.every((symbol) => symbol.occurrences.length === 0)).toBe(true);
    expect(index.symbols.every((symbol) => symbol.declarations.length > 0)).toBe(true);
  });
});

/** expected.json の値を、比較しやすいよう並べ替えた形にする。 */
function expected2Sorted(): Record<string, string[]> {
  return Object.fromEntries(fixtureNames.map((name) => [name, [...expected[name]].sort()]));
}
