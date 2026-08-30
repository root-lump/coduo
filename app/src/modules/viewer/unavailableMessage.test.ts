import { describe, expect, it } from "vitest";
import type { FileContent } from "../workspace";
import { unavailableMessageFor } from "./unavailableMessage";

function file(overrides: Partial<FileContent>): FileContent {
  return {
    path: "src/lib.rs",
    content: "",
    language: "plaintext",
    lineCount: 1,
    ...overrides,
  };
}

describe("unavailableMessageFor", () => {
  it("prefers the explicit unavailableMessage", () => {
    expect(
      unavailableMessageFor(
        file({ unavailableReason: "error", unavailableMessage: "詳細な理由" }),
      ),
    ).toBe("詳細な理由");
  });

  it.each([
    ["binary", "バイナリファイルはコードビューアに表示できません。"],
    ["too-large", "このファイルはビューアの上限である2 MBを超えています。"],
    [
      "not-collected",
      "このファイルはスナップショットの収集範囲外です（ファイル名のみ収録）。",
    ],
    ["error", "Coduoでこのファイルを読み込めませんでした。"],
  ] as const)("maps %s to its message", (reason, message) => {
    expect(unavailableMessageFor(file({ unavailableReason: reason }))).toBe(
      message,
    );
  });

  it("treats a file without a reason as empty", () => {
    expect(unavailableMessageFor(file({}))).toBe("このファイルは空です。");
  });
});
