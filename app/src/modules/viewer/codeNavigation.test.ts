import { describe, expect, it } from "vitest";
import {
  buildDefinitionIndex,
  definitionsFor,
  referencesFor,
} from "./codeNavigation";
import type { FileContent } from "../workspace";

function file(path: string, language: string, content: string): FileContent {
  return { path, language, content, lineCount: content.split("\n").length };
}

describe("buildDefinitionIndex", () => {
  it("TypeScript の export された宣言を名前の位置つきで拾う", () => {
    const index = buildDefinitionIndex([
      file(
        "src/a.ts",
        "typescript",
        [
          "export const answer = 42;",
          "export default function main() {}",
          "export type Payload = { id: string };",
          "class Widget {}",
        ].join("\n"),
      ),
    ]);
    expect(definitionsFor(index, "answer")).toEqual([
      {
        path: "src/a.ts",
        lineNumber: 1,
        startColumn: 14,
        endColumn: 20,
      },
    ]);
    expect(definitionsFor(index, "main")).toHaveLength(1);
    expect(definitionsFor(index, "Payload")).toHaveLength(1);
    expect(definitionsFor(index, "Widget")).toHaveLength(1);
  });

  it("Python の def / class を拾う", () => {
    const index = buildDefinitionIndex([
      file(
        "lib/tool.py",
        "python",
        ["class Reporter:", "    async def emit(self):", "        pass"].join(
          "\n",
        ),
      ),
    ]);
    expect(definitionsFor(index, "Reporter")).toHaveLength(1);
    expect(definitionsFor(index, "emit")).toEqual([
      { path: "lib/tool.py", lineNumber: 2, startColumn: 15, endColumn: 19 },
    ]);
  });

  it("Go のレシーバ付き func と type を拾う", () => {
    const index = buildDefinitionIndex([
      file(
        "pkg/server.go",
        "go",
        [
          "type Server struct {}",
          "func (s *Server) Start() error { return nil }",
          "func NewServer() *Server { return nil }",
        ].join("\n"),
      ),
    ]);
    expect(definitionsFor(index, "Server")).toHaveLength(1);
    expect(definitionsFor(index, "Start")).toHaveLength(1);
    expect(definitionsFor(index, "NewServer")).toHaveLength(1);
  });

  it("Rust の pub fn / struct を拾う", () => {
    const index = buildDefinitionIndex([
      file(
        "src/lib.rs",
        "rust",
        ["pub struct Config;", "pub async fn load() -> Config { Config }"].join(
          "\n",
        ),
      ),
    ]);
    expect(definitionsFor(index, "Config")).toHaveLength(1);
    expect(definitionsFor(index, "load")).toHaveLength(1);
  });

  it("language が空なら拡張子から言語を推定する", () => {
    const index = buildDefinitionIndex([
      file("src/b.ts", "", "export function helper() {}"),
    ]);
    expect(definitionsFor(index, "helper")).toHaveLength(1);
  });

  it("パターン表に無い言語は対象外になる", () => {
    const index = buildDefinitionIndex([
      file("notes.txt", "plaintext", "function looksLikeCode() {}"),
    ]);
    expect(definitionsFor(index, "looksLikeCode")).toEqual([]);
  });

  it("同名の宣言はファイルの与えられた順で並ぶ", () => {
    const index = buildDefinitionIndex([
      file("src/a.ts", "typescript", "export const shared = 1;"),
      file("src/b.ts", "typescript", "const shared = 2;"),
    ]);
    expect(definitionsFor(index, "shared").map((entry) => entry.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });
});

describe("referencesFor", () => {
  const files = [
    file(
      "src/a.ts",
      "typescript",
      ["export const answer = 42;", "const answers = [answer];"].join("\n"),
    ),
    file("src/b.ts", "typescript", "import { answer } from './a';"),
  ];

  it("単語境界つきで全ファイルの出現位置を返す", () => {
    const references = referencesFor(files, "answer");
    expect(references).toEqual([
      { path: "src/a.ts", lineNumber: 1, startColumn: 14, endColumn: 20 },
      { path: "src/a.ts", lineNumber: 2, startColumn: 18, endColumn: 24 },
      { path: "src/b.ts", lineNumber: 1, startColumn: 10, endColumn: 16 },
    ]);
  });

  it("部分一致（answers）を拾わない", () => {
    const references = referencesFor(files, "answers");
    expect(references).toEqual([
      { path: "src/a.ts", lineNumber: 2, startColumn: 7, endColumn: 14 },
    ]);
  });

  it("単語でない入力には空を返す", () => {
    expect(referencesFor(files, "a.b")).toEqual([]);
    expect(referencesFor(files, "")).toEqual([]);
  });
});
