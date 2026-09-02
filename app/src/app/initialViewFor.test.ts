import { describe, expect, it } from "vitest";
import { initialViewFor } from "./initialViewFor";

describe("initialViewFor", () => {
  it("PR と作業ツリーの payload は差分の 1 画面表示で始める", () => {
    expect(initialViewFor("pull_request")).toEqual({
      viewMode: "diff",
      renderSideBySide: false,
    });
    expect(initialViewFor("local-directory")).toEqual({
      viewMode: "diff",
      renderSideBySide: false,
    });
  });

  it("リポジトリ全体と単一ファイルの payload は通常表示で始める", () => {
    expect(initialViewFor("repository")).toEqual({
      viewMode: "code",
      renderSideBySide: true,
    });
    expect(initialViewFor("local-file")).toEqual({
      viewMode: "code",
      renderSideBySide: true,
    });
  });
});
