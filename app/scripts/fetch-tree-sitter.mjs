// tree-sitter の実行系と文法を、収集スクリプトが使える形へ書き出す。
//
//   node scripts/fetch-tree-sitter.mjs
//
// 出力（../skills/create-code-tour/assets/tree-sitter/）:
//   runtime/web-tree-sitter.js    実行系（そのまま）
//   runtime/web-tree-sitter.wasm.gz
//   grammars/<文法ID>.wasm.gz
//   queries/<文法ID>.tags.scm     上流の tags クエリ（TypeScript / TSX は JavaScript の
//                                 tags を先頭に連結する。TS 文法は JS 文法を継承しており、
//                                 上流の tags.scm が差分しか持たないため）
//   manifest.json                 文法 ID → ファイル名・取り込み元・バージョン、
//                                 および言語 ID / 拡張子からの引き当て表
//
// wasm は解析表が主体で gzip が 10 倍以上効くため、圧縮して置く（合計 17MB → 1.5MB 弱）。
// 補助クエリ（queries/<文法ID>.extra.scm）は手書きの資産なので、このスクリプトは触らない。
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(appRoot, "node_modules");
const outDir = join(appRoot, "..", "skills", "create-code-tour", "assets", "tree-sitter");

/**
 * 文法 ID は Monaco の言語 ID に合わせる。TSX だけは Monaco 側に対応する
 * 言語 ID が無い（.tsx も language は "typescript"）ため、拡張子から引く。
 */
const GRAMMARS = [
  { id: "go", pkg: "tree-sitter-go", wasm: "tree-sitter-go.wasm" },
  { id: "typescript", pkg: "tree-sitter-typescript", wasm: "tree-sitter-typescript.wasm", inherits: "tree-sitter-javascript" },
  { id: "tsx", pkg: "tree-sitter-typescript", wasm: "tree-sitter-tsx.wasm", inherits: "tree-sitter-javascript" },
  { id: "javascript", pkg: "tree-sitter-javascript", wasm: "tree-sitter-javascript.wasm" },
  { id: "python", pkg: "tree-sitter-python", wasm: "tree-sitter-python.wasm" },
  { id: "rust", pkg: "tree-sitter-rust", wasm: "tree-sitter-rust.wasm" },
  { id: "java", pkg: "tree-sitter-java", wasm: "tree-sitter-java.wasm" },
  { id: "cpp", pkg: "tree-sitter-cpp", wasm: "tree-sitter-cpp.wasm" },
  { id: "csharp", pkg: "tree-sitter-c-sharp", wasm: "tree-sitter-c_sharp.wasm" },
  { id: "ruby", pkg: "tree-sitter-ruby", wasm: "tree-sitter-ruby.wasm" },
  { id: "php", pkg: "tree-sitter-php", wasm: "tree-sitter-php.wasm" },
];

/** 言語 ID では区別できない文法を拡張子から引く。 */
const GRAMMAR_BY_EXTENSION = { tsx: "tsx" };

function packageVersion(pkg) {
  return JSON.parse(readFileSync(join(modulesDir, pkg, "package.json"), "utf8")).version;
}

function read(pkg, ...segments) {
  return readFileSync(join(modulesDir, pkg, ...segments));
}

function writeGzip(path, data) {
  // level 9 固定。CI の同期チェックは展開後の内容で比較するので、
  // 圧縮結果のバイト列が処理系間で一致することには依存しない。
  writeFileSync(path, gzipSync(data, { level: 9 }));
}

rmSync(join(outDir, "runtime"), { recursive: true, force: true });
rmSync(join(outDir, "grammars"), { recursive: true, force: true });
mkdirSync(join(outDir, "runtime"), { recursive: true });
mkdirSync(join(outDir, "grammars"), { recursive: true });
mkdirSync(join(outDir, "queries"), { recursive: true });

const runtimeVersion = packageVersion("web-tree-sitter");
writeFileSync(
  join(outDir, "runtime", "web-tree-sitter.js"),
  // .map は同梱しないので、参照だけ残ると読み込み側（vite 等）が警告を出す。
  String(read("web-tree-sitter", "web-tree-sitter.js")).replace(
    /^\/\/# sourceMappingURL=.*$/m,
    "",
  ),
);
writeGzip(
  join(outDir, "runtime", "web-tree-sitter.wasm.gz"),
  read("web-tree-sitter", "web-tree-sitter.wasm"),
);

// 手書きの補助クエリは残し、このスクリプトが書き出す tags だけ入れ替える。
for (const name of readdirSync(join(outDir, "queries"))) {
  if (name.endsWith(".tags.scm")) {
    rmSync(join(outDir, "queries", name));
  }
}

const grammars = {};
for (const grammar of GRAMMARS) {
  writeGzip(join(outDir, "grammars", `${grammar.id}.wasm.gz`), read(grammar.pkg, grammar.wasm));
  const tags = grammar.inherits
    ? `${read(grammar.inherits, "queries", "tags.scm")}\n${read(grammar.pkg, "queries", "tags.scm")}`
    : String(read(grammar.pkg, "queries", "tags.scm"));
  writeFileSync(join(outDir, "queries", `${grammar.id}.tags.scm`), tags);
  grammars[grammar.id] = {
    package: grammar.pkg,
    version: packageVersion(grammar.pkg),
    wasm: `grammars/${grammar.id}.wasm.gz`,
    tags: `queries/${grammar.id}.tags.scm`,
    extra: `queries/${grammar.id}.extra.scm`,
    ...(grammar.inherits
      ? { inheritsTagsFrom: `${grammar.inherits}@${packageVersion(grammar.inherits)}` }
      : {}),
  };
}

const manifest = {
  runtime: {
    package: "web-tree-sitter",
    version: runtimeVersion,
    js: "runtime/web-tree-sitter.js",
    wasm: "runtime/web-tree-sitter.wasm.gz",
  },
  grammarByExtension: GRAMMAR_BY_EXTENSION,
  grammars,
};
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

let total = 0;
for (const dir of ["runtime", "grammars", "queries"]) {
  for (const name of readdirSync(join(outDir, dir))) {
    total += readFileSync(join(outDir, dir, name)).length;
  }
}
console.error(
  JSON.stringify(
    {
      grammars: Object.keys(grammars).length,
      runtime: runtimeVersion,
      totalBytes: total,
      manifestSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 12),
    },
    null,
    2,
  ),
);
