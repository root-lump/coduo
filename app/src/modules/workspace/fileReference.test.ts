import { describe, expect, it } from "vitest";
import { parseFileReference } from "./fileReference";

const files = new Set(["src/lib.rs", "src/main.rs", "README.md"]);

describe("parseFileReference", () => {
  it("パスだけなら行指定なしの参照になる", () => {
    expect(parseFileReference("src/lib.rs", files)).toEqual({
      file: "src/lib.rs",
    });
  });

  it("行番号 1 つは同じ行を始点と終点にする", () => {
    expect(parseFileReference("src/lib.rs:12", files)).toEqual({
      file: "src/lib.rs",
      range: { startLine: 12, endLine: 12 },
    });
  });

  it("行範囲を受け付ける", () => {
    expect(parseFileReference("src/lib.rs:12-20", files)).toEqual({
      file: "src/lib.rs",
      range: { startLine: 12, endLine: 20 },
    });
  });

  it("前後の空白は無視する", () => {
    expect(parseFileReference("  README.md:3 ", files)).toEqual({
      file: "README.md",
      range: { startLine: 3, endLine: 3 },
    });
  });

  it("snapshot に無いパスは参照にしない", () => {
    expect(parseFileReference("src/other.rs", files)).toBeUndefined();
    expect(parseFileReference("lib.rs", files)).toBeUndefined();
  });

  it("不正な行指定は参照にしない", () => {
    expect(parseFileReference("src/lib.rs:0", files)).toBeUndefined();
    expect(parseFileReference("src/lib.rs:20-12", files)).toBeUndefined();
    expect(parseFileReference("src/lib.rs:abc", files)).toBeUndefined();
  });

  it("空文字は参照にしない", () => {
    expect(parseFileReference("", files)).toBeUndefined();
  });
});
