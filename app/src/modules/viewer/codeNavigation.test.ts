import { describe, expect, it } from "vitest";
import {
  definitionsFor,
  loadCodeNavigationIndex,
  referencesFor,
} from "./codeNavigation";
import type { SymbolIndex } from "../../shared/snapshot/SymbolIndex";

const index: SymbolIndex = {
  degraded: false,
  generator: { grammars: { typescript: "0.23.2" }, webTreeSitter: "0.27.0" },
  kinds: ["constant", "function"],
  paths: ["src/a.ts", "src/b.ts"],
  symbols: [
    {
      name: "answer",
      declarations: [[0, 1, 14, 20, 0]],
      occurrences: [
        [0, 1, 14],
        [1, 3, 9],
      ],
    },
    {
      name: "compute",
      declarations: [
        [0, 5, 17, 24, 1],
        [1, 2, 17, 24, 1],
      ],
      occurrences: [[0, 5, 17]],
    },
  ],
};

describe("loadCodeNavigationIndex", () => {
  it("宣言をパスと位置つきで引ける", () => {
    const navigation = loadCodeNavigationIndex(index);
    expect(definitionsFor(navigation, "answer")).toEqual([
      { path: "src/a.ts", lineNumber: 1, startColumn: 14, endColumn: 20 },
    ]);
  });

  it("同名の宣言が複数あればすべて返す", () => {
    const navigation = loadCodeNavigationIndex(index);
    expect(definitionsFor(navigation, "compute")).toHaveLength(2);
    expect(definitionsFor(navigation, "compute")[1].path).toBe("src/b.ts");
  });

  it("索引に無い名前では空を返す", () => {
    const navigation = loadCodeNavigationIndex(index);
    expect(definitionsFor(navigation, "unknown")).toEqual([]);
    expect(referencesFor(navigation, "unknown")).toEqual([]);
  });

  it("参照は名前の長さから終端列を補って返す", () => {
    const navigation = loadCodeNavigationIndex(index);
    expect(referencesFor(navigation, "answer")).toEqual([
      { path: "src/a.ts", lineNumber: 1, startColumn: 14, endColumn: 20 },
      { path: "src/b.ts", lineNumber: 3, startColumn: 9, endColumn: 15 },
    ]);
  });

  it("出現位置を落とした索引でも宣言は引ける", () => {
    const degraded: SymbolIndex = {
      ...index,
      degraded: true,
      symbols: index.symbols.map((symbol) => ({ ...symbol, occurrences: [] })),
    };
    const navigation = loadCodeNavigationIndex(degraded);
    expect(definitionsFor(navigation, "answer")).toHaveLength(1);
    expect(referencesFor(navigation, "answer")).toEqual([]);
  });
});
