// 収集した本文から、ビューアのコードナビゲーション用の索引を作る。
//
// 宣言の抽出は tree-sitter の tags クエリで行い（assets/tree-sitter/ 参照）、
// 文法を同梱していない言語だけ正規表現に落とす。抽出規則をここ 1 か所に集めることで、
// ビューアは索引を引くだけになる。
//
// 索引は「宣言」と「宣言のある名前の出現」だけを持つ。すべての識別子の出現を載せると
// 索引が本文の 1.8 倍に膨らみ、埋め込み後 16MB の制限に先に当たるため。
import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** 索引の既定上限。超えたら出現位置を落として宣言だけにする。 */
export const DEFAULT_INDEX_BUDGET_BYTES = 1_500_000;

// 文法を同梱していない言語向けの宣言パターン。各パターンはシンボル名を capture group 1
// に持ち、名前がマッチ全体の末尾に来るように書く（名前の列位置を match 末尾からの
// 逆算で求めるため）。tree-sitter 対応言語はこの表に載せない。
const TS_JS_PATTERNS = [
  /(?:^|\s)(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|class|interface|enum|namespace|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /(?:^|\s)(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/g,
];

const DECLARATION_PATTERNS = {
  kotlin: [/(?:^|\s)(?:fun|class|interface|object|typealias)\s+([A-Za-z_]\w*)/g],
  swift: [
    /(?:^|\s)(?:func|class|struct|enum|protocol|typealias|actor)\s+([A-Za-z_]\w*)/g,
  ],
  shell: [/^\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\s*\)/g],
  // 文法を同梱していない環境（assets が無い等）へのフォールバックとしても使う。
  typescript: TS_JS_PATTERNS,
  javascript: TS_JS_PATTERNS,
};

const WORD_PATTERN = /[A-Za-z_$][\w$]*/g;

// 同じ名前・同じ位置が複数の種別で捕捉されることがある（Rust の `fn` は上流の tags が
// function と method の両方で拾い、TypeScript の `const f = () => {}` は上流が function、
// 補助クエリが constant で拾う）。表示に有用な種別を残して 1 件に畳む。
const KIND_PRIORITY = [
  "method",
  "function",
  "class",
  "interface",
  "enum",
  "type",
  "module",
  "macro",
  "constant",
  "variable",
  "field",
  "symbol",
];

function kindRank(kind) {
  const rank = KIND_PRIORITY.indexOf(kind);
  return rank === -1 ? KIND_PRIORITY.length : rank;
}

// 識別子らしい葉ノードの判定から外すノード種別。文字列リテラルの中身やコメントは、
// 名前と同じ綴りでも参照ではないため落とす。
const NON_IDENTIFIER_NODE = /string|comment|char|literal|content|text|escape|regex|heredoc|raw/;
const IDENTIFIER_TEXT = /^[A-Za-z_$][\w$]*$/;

function extensionOf(path) {
  const name = path.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function loadManifest(assetsDir) {
  const path = join(assetsDir, "manifest.json");
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** 言語 ID では区別できない文法（TSX）は拡張子で引く。 */
function grammarIdFor(manifest, path, language) {
  if (!manifest) {
    return null;
  }
  const byExtension = manifest.grammarByExtension?.[extensionOf(path)];
  if (byExtension && manifest.grammars[byExtension]) {
    return byExtension;
  }
  return manifest.grammars[language] ? language : null;
}

async function initRuntime(assetsDir, manifest) {
  const module = await import(pathToFileURL(join(assetsDir, manifest.runtime.js)).href);
  const wasmBinary = gunzipSync(readFileSync(join(assetsDir, manifest.runtime.wasm)));
  await module.Parser.init({ wasmBinary });
  return module;
}

function loadQuerySource(assetsDir, entry) {
  const tags = readFileSync(join(assetsDir, entry.tags), "utf8");
  const extraPath = join(assetsDir, entry.extra);
  // 補助クエリは、上流の tags が @definition を付けていない宣言（Go の const / var、
  // TypeScript の type エイリアスなど）を埋めるための手書き資産。無い言語もある。
  return existsSync(extraPath) ? `${tags}\n${readFileSync(extraPath, "utf8")}` : tags;
}

/**
 * 文法ごとに Language と Query を用意する。読み込みに失敗した文法は落とし、
 * その言語のファイルは正規表現経路へ回す（fail closed にしない）。
 */
async function loadGrammars(runtime, assetsDir, manifest, ids, warnings) {
  const loaded = new Map();
  for (const id of ids) {
    const entry = manifest.grammars[id];
    try {
      const language = await runtime.Language.load(
        gunzipSync(readFileSync(join(assetsDir, entry.wasm))),
      );
      const query = new runtime.Query(language, loadQuerySource(assetsDir, entry));
      const parser = new runtime.Parser();
      parser.setLanguage(language);
      loaded.set(id, { parser, query, version: entry.version });
    } catch (error) {
      warnings.push(`文法 ${id} を読み込めませんでした: ${error.message}`);
    }
  }
  return loaded;
}

function collectByTreeSitter(grammar, content, onDeclaration, onOccurrence) {
  const tree = grammar.parser.parse(content);
  try {
    for (const match of grammar.query.matches(tree.rootNode)) {
      let name = null;
      let kind = null;
      for (const capture of match.captures) {
        if (capture.name === "name") {
          name = capture.node;
        } else if (capture.name.startsWith("definition.")) {
          kind = capture.name.slice("definition.".length);
        }
      }
      if (!name || !kind) {
        continue;
      }
      onDeclaration({
        name: name.text,
        kind,
        // tree-sitter の行・列は 0 始まりで、列は UTF-16 コード単位。Monaco は
        // どちらも 1 始まりの UTF-16 コード単位なので、+1 するだけでよい。
        lineNumber: name.startPosition.row + 1,
        startColumn: name.startPosition.column + 1,
        endColumn: name.endPosition.column + 1,
      });
    }
    // 出現は「名前つきの葉ノードで、綴りが識別子であるもの」を拾う。キーワードや
    // 記号は無名ノードなので自然に外れ、コメントと文字列は種別で外す。
    const stack = [tree.rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node.childCount > 0) {
        for (let i = node.childCount - 1; i >= 0; i -= 1) {
          stack.push(node.child(i));
        }
        continue;
      }
      if (!node.isNamed || NON_IDENTIFIER_NODE.test(node.type)) {
        continue;
      }
      const text = node.text;
      if (!IDENTIFIER_TEXT.test(text)) {
        continue;
      }
      onOccurrence({
        name: text,
        lineNumber: node.startPosition.row + 1,
        startColumn: node.startPosition.column + 1,
      });
    }
  } finally {
    tree.delete();
  }
}

function collectByPattern(language, content, onDeclaration, onOccurrence) {
  const patterns = DECLARATION_PATTERNS[language];
  const lines = content.split("\n");
  lines.forEach((line, lineIndex) => {
    for (const pattern of patterns ?? []) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
        const name = match[1];
        // 名前はマッチ全体の末尾に来る（パターン側の不変条件）。
        const startColumn = match.index + match[0].length - name.length + 1;
        onDeclaration({
          name,
          kind: "symbol",
          lineNumber: lineIndex + 1,
          startColumn,
          endColumn: startColumn + name.length,
        });
      }
    }
    WORD_PATTERN.lastIndex = 0;
    for (let match = WORD_PATTERN.exec(line); match; match = WORD_PATTERN.exec(line)) {
      onOccurrence({
        name: match[0],
        lineNumber: lineIndex + 1,
        startColumn: match.index + 1,
      });
    }
  });
}

function compareTriple(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * 索引を組み立てる。
 *
 * @param fileContents path → { content, language } の連想配列（readable なファイルのみ）
 * @param options.assetsDir assets/tree-sitter/ の絶対パス
 * @param options.budgetBytes 索引の上限バイト数
 * @returns { index, stats }
 */
export async function buildSymbolIndex(fileContents, options = {}) {
  const assetsDir = options.assetsDir;
  const budgetBytes = options.budgetBytes ?? DEFAULT_INDEX_BUDGET_BYTES;
  const warnings = [];
  const manifest = assetsDir ? loadManifest(assetsDir) : null;
  if (assetsDir && !manifest) {
    warnings.push("tree-sitter の manifest が見つかりません。正規表現のみで索引を作ります");
  }

  const paths = Object.keys(fileContents).sort((a, b) => a.localeCompare(b));
  const pathIndex = new Map(paths.map((path, index) => [path, index]));
  const grammarByPath = new Map();
  const neededGrammars = new Set();
  for (const path of paths) {
    const id = grammarIdFor(manifest, path, fileContents[path].language);
    grammarByPath.set(path, id);
    if (id) {
      neededGrammars.add(id);
    }
  }

  let runtime = null;
  let grammars = new Map();
  if (manifest && neededGrammars.size > 0) {
    try {
      runtime = await initRuntime(assetsDir, manifest);
      grammars = await loadGrammars(runtime, assetsDir, manifest, [...neededGrammars], warnings);
    } catch (error) {
      warnings.push(`tree-sitter の初期化に失敗しました: ${error.message}`);
    }
  }

  const declarations = new Map(); // name → [[pathIdx, line, startCol, endCol, kind]]
  const occurrences = new Map(); // name → [[pathIdx, line, startCol]]
  const kinds = new Set();
  const perLanguage = new Map();

  function bump(language, field) {
    const stat = perLanguage.get(language) ?? { files: 0, declarations: 0, treeSitter: false };
    stat[field] += 1;
    perLanguage.set(language, stat);
  }

  for (const path of paths) {
    const file = fileContents[path];
    const pathIdx = pathIndex.get(path);
    const grammarId = grammarByPath.get(path);
    const grammar = grammarId ? grammars.get(grammarId) : undefined;
    const language = file.language || "plaintext";
    const onDeclaration = (declaration) => {
      const list = declarations.get(declaration.name) ?? [];
      const existing = list.find(
        (entry) =>
          entry[0] === pathIdx &&
          entry[1] === declaration.lineNumber &&
          entry[2] === declaration.startColumn,
      );
      if (existing) {
        if (kindRank(declaration.kind) < kindRank(existing[4])) {
          existing[4] = declaration.kind;
          kinds.add(declaration.kind);
        }
        return;
      }
      kinds.add(declaration.kind);
      list.push([
        pathIdx,
        declaration.lineNumber,
        declaration.startColumn,
        declaration.endColumn,
        declaration.kind,
      ]);
      declarations.set(declaration.name, list);
      bump(language, "declarations");
    };
    const onOccurrence = (occurrence) => {
      const list = occurrences.get(occurrence.name) ?? [];
      list.push([pathIdx, occurrence.lineNumber, occurrence.startColumn]);
      occurrences.set(occurrence.name, list);
    };

    bump(language, "files");
    if (grammar) {
      const stat = perLanguage.get(language);
      stat.treeSitter = true;
      try {
        collectByTreeSitter(grammar, file.content, onDeclaration, onOccurrence);
        continue;
      } catch (error) {
        warnings.push(`${path} の解析に失敗しました: ${error.message}`);
      }
    }
    collectByPattern(language, file.content, onDeclaration, onOccurrence);
  }

  const kindList = [...kinds].sort();
  const kindIndex = new Map(kindList.map((kind, index) => [kind, index]));
  const symbols = [...declarations.keys()].sort().map((name) => ({
    name,
    declarations: declarations
      .get(name)
      .map(([p, line, start, end, kind]) => [p, line, start, end, kindIndex.get(kind)])
      .sort(compareTriple),
    occurrences: (occurrences.get(name) ?? []).sort(compareTriple),
  }));

  const generatorGrammars = {};
  for (const [id, grammar] of grammars) {
    generatorGrammars[id] = grammar.version;
  }
  const index = {
    degraded: false,
    generator: {
      grammars: generatorGrammars,
      webTreeSitter: manifest?.runtime.version ?? null,
    },
    kinds: kindList,
    paths,
    symbols,
  };

  let bytes = JSON.stringify(index).length;
  if (bytes > budgetBytes) {
    index.degraded = true;
    for (const symbol of index.symbols) {
      symbol.occurrences = [];
    }
    bytes = JSON.stringify(index).length;
  }

  const declarationCount = symbols.reduce((sum, s) => sum + s.declarations.length, 0);
  const occurrenceCount = index.symbols.reduce((sum, s) => sum + s.occurrences.length, 0);
  return {
    index,
    stats: {
      indexBytes: bytes,
      degraded: index.degraded,
      declarations: declarationCount,
      names: symbols.length,
      occurrences: occurrenceCount,
      byLanguage: Object.fromEntries(
        [...perLanguage.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([language, stat]) => [
            language,
            { files: stat.files, declarations: stat.declarations, treeSitter: stat.treeSitter },
          ]),
      ),
      warnings,
    },
  };
}
