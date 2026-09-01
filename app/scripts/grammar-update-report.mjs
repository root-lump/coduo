// 文法更新の前後を比べて PR 本文（Markdown）を書き出す（CI 用）。
//
//   node scripts/grammar-update-report.mjs before.json after.json > body.md
import { readFileSync } from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("usage: node scripts/grammar-update-report.mjs <before.json> <after.json>");
  process.exit(1);
}
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const lines = ["## 概要", "", "同梱している tree-sitter の実行系と文法を上流の最新版へ更新します。", ""];

lines.push("## バージョン", "", "| 対象 | 更新前 | 更新後 |", "| --- | --- | --- |");
lines.push(`| web-tree-sitter | ${before.runtime} | ${after.runtime} |`);
for (const id of Object.keys(after.grammars).sort()) {
  const from = before.grammars[id] ?? "（新規）";
  const to = after.grammars[id];
  if (from !== to) {
    lines.push(`| ${id} | ${from} | ${to} |`);
  }
}

lines.push("", "## fixture から抽出できた宣言の件数", "");
lines.push("件数が減っている言語があれば、文法か tags クエリの互換が崩れた合図です。");
lines.push("", "| fixture | 更新前 | 更新後 |", "| --- | --- | --- |");
const paths = new Set([...Object.keys(before.declarations), ...Object.keys(after.declarations)]);
for (const path of [...paths].sort()) {
  const from = before.declarations[path] ?? 0;
  const to = after.declarations[path] ?? 0;
  const mark = to < from ? " ⚠️" : "";
  lines.push(`| ${path} | ${from} | ${to}${mark} |`);
}

lines.push(
  "",
  "## 検証",
  "",
  "- `pnpm test:run`（fixture による索引検証を含む）",
  "- `pnpm typecheck`",
  "",
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
);

process.stdout.write(`${lines.join("\n")}\n`);
