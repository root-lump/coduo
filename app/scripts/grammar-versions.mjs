// 同梱している tree-sitter の版と、fixture から抽出できる宣言の件数を出す（CI 用）。
//
//   node scripts/grammar-versions.mjs > versions.json
//
// 文法の更新前後でこれを撮り、grammar-update-report.mjs で差分を PR 本文にする。
// 宣言の件数は、文法や tags クエリの互換が崩れたときに減る指標として見る。
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSymbolIndex } from "../../skills/create-code-tour/scripts/symbol-index.mjs";

const skillRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../skills/create-code-tour",
);
const assetsDir = join(skillRoot, "assets/tree-sitter");
const fixturesDir = join(skillRoot, "scripts/fixtures");
const manifest = JSON.parse(readFileSync(join(assetsDir, "manifest.json"), "utf8"));

const fileContents = {};
for (const name of readdirSync(fixturesDir)) {
  if (name.endsWith(".json")) {
    continue;
  }
  const id = name.split(".")[0];
  fileContents[name] = {
    content: readFileSync(join(fixturesDir, name), "utf8"),
    language: id === "tsx" ? "typescript" : id,
  };
}

const { index } = await buildSymbolIndex(fileContents, { assetsDir });
const declarationsByPath = {};
for (const symbol of index.symbols) {
  for (const [pathIdx] of symbol.declarations) {
    const path = index.paths[pathIdx];
    declarationsByPath[path] = (declarationsByPath[path] ?? 0) + 1;
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      runtime: manifest.runtime.version,
      grammars: Object.fromEntries(
        Object.entries(manifest.grammars).map(([id, entry]) => [id, entry.version]),
      ),
      declarations: declarationsByPath,
    },
    null,
    2,
  )}\n`,
);
