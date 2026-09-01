// コードナビゲーション（定義ジャンプ・参照一覧）の索引引き。
// 索引そのものは収集時に作られて payload に載る（skills/create-code-tour/scripts/symbol-index.mjs）。
// ビューアは抽出を行わず、名前から位置を引くだけ。
import type { SymbolIndex } from "../../shared/snapshot/SymbolIndex";

export type SymbolLocation = {
  path: string;
  /** 1 始まり。列はシンボル名そのものの範囲。 */
  lineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type CodeNavigationIndex = {
  definitions: Map<string, SymbolLocation[]>;
  references: Map<string, SymbolLocation[]>;
};

/** payload の索引を、名前引きの Map に組み直す（起動時に 1 度だけ）。 */
export function loadCodeNavigationIndex(
  index: SymbolIndex,
): CodeNavigationIndex {
  const definitions = new Map<string, SymbolLocation[]>();
  const references = new Map<string, SymbolLocation[]>();
  for (const symbol of index.symbols) {
    definitions.set(
      symbol.name,
      symbol.declarations.map(([path, lineNumber, startColumn, endColumn]) => ({
        path: index.paths[path],
        lineNumber,
        startColumn,
        endColumn,
      })),
    );
    references.set(
      symbol.name,
      symbol.occurrences.map(([path, lineNumber, startColumn]) => ({
        path: index.paths[path],
        lineNumber,
        startColumn,
        endColumn: startColumn + symbol.name.length,
      })),
    );
  }
  return { definitions, references };
}

export function definitionsFor(
  index: CodeNavigationIndex,
  word: string,
): SymbolLocation[] {
  return index.definitions.get(word) ?? [];
}

export function referencesFor(
  index: CodeNavigationIndex,
  word: string,
): SymbolLocation[] {
  return index.references.get(word) ?? [];
}
