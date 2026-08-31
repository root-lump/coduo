// コードナビゲーション（定義ジャンプ・参照一覧）のヒューリスティック。
// Artifact には言語サービスを同梱しない設計（monacoEnvironment.ts 参照）のため、
// 定義は言語ごとの宣言パターンの正規表現抽出、参照は単語一致の横断検索で解決する。
// 候補が無いシンボルでは何も起きない（誤ジャンプより空振りに倒す）。
import type { FileContent } from "../workspace";
import { languageFromPath } from "./language";

export type SymbolLocation = {
  path: string;
  /** 1 始まり。列はシンボル名そのものの範囲。 */
  lineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type DefinitionIndex = Map<string, SymbolLocation[]>;

// 各パターンはシンボル名を capture group 1 に持ち、名前がマッチ全体の末尾に
// 来るように書く（名前の列位置を match 末尾からの逆算で求めるため）。
const TS_JS_PATTERNS = [
  /(?:^|\s)(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\s*\*?|class|interface|enum|namespace|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /(?:^|\s)(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/g,
];

const DECLARATION_PATTERNS: Record<string, RegExp[]> = {
  typescript: TS_JS_PATTERNS,
  javascript: TS_JS_PATTERNS,
  python: [/^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/g],
  go: [
    /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g,
    /^\s*(?:type|var|const)\s+([A-Za-z_]\w*)/g,
  ],
  rust: [
    /(?:^|\s)(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?(?:async\s+)?(?:fn|struct|enum|trait|mod|type|const|static)\s+([A-Za-z_]\w*)/g,
  ],
  java: [/(?:^|\s)(?:class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)/g],
  kotlin: [
    /(?:^|\s)(?:fun|class|interface|object|typealias)\s+([A-Za-z_]\w*)/g,
  ],
  csharp: [
    /(?:^|\s)(?:class|interface|enum|struct|record|delegate|namespace)\s+([A-Za-z_]\w*)/g,
  ],
  swift: [
    /(?:^|\s)(?:func|class|struct|enum|protocol|typealias|actor)\s+([A-Za-z_]\w*)/g,
  ],
  cpp: [
    /(?:^|\s)(?:class|struct|enum(?:\s+class)?|namespace|union)\s+([A-Za-z_]\w*)/g,
    /^\s*#\s*define\s+([A-Za-z_]\w*)/g,
  ],
  ruby: [/^\s*(?:def\s+(?:self\.)?|class\s+|module\s+)([A-Za-z_]\w*)/g],
  php: [
    /(?:^|\s)(?:function\s+&?|class\s+|interface\s+|trait\s+|const\s+)([A-Za-z_]\w*)/g,
  ],
};
DECLARATION_PATTERNS.c = DECLARATION_PATTERNS.cpp;

function languageOf(file: FileContent): string {
  return file.language || languageFromPath(file.path);
}

/** readable な全ファイルから「シンボル名 → 宣言位置の列」を構築する。 */
export function buildDefinitionIndex(files: FileContent[]): DefinitionIndex {
  const index: DefinitionIndex = new Map();
  for (const file of files) {
    const patterns = DECLARATION_PATTERNS[languageOf(file)];
    if (!patterns) {
      continue;
    }
    const lines = file.content.split("\n");
    lines.forEach((line, lineIndex) => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (
          let match = pattern.exec(line);
          match;
          match = pattern.exec(line)
        ) {
          const name = match[1];
          // 名前はマッチ全体の末尾に来る（パターン側の不変条件）。
          const startColumn = match.index + match[0].length - name.length + 1;
          const locations = index.get(name) ?? [];
          locations.push({
            path: file.path,
            lineNumber: lineIndex + 1,
            startColumn,
            endColumn: startColumn + name.length,
          });
          index.set(name, locations);
        }
      }
    });
  }
  return index;
}

export function definitionsFor(
  index: DefinitionIndex,
  word: string,
): SymbolLocation[] {
  return index.get(word) ?? [];
}

const WORD_CHARACTER = /[\w$]/;

/** 全ファイルを対象にした、単語境界つきの出現位置検索。 */
export function referencesFor(
  files: FileContent[],
  word: string,
): SymbolLocation[] {
  if (!word || [...word].some((char) => !WORD_CHARACTER.test(char))) {
    return [];
  }
  const escaped = word.replace(/[$\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, "g");
  const locations: SymbolLocation[] = [];
  for (const file of files) {
    const lines = file.content.split("\n");
    lines.forEach((line, lineIndex) => {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
        locations.push({
          path: file.path,
          lineNumber: lineIndex + 1,
          startColumn: match.index + 1,
          endColumn: match.index + 1 + word.length,
        });
      }
    });
  }
  return locations;
}
