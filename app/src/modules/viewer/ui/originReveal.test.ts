import { describe, expect, it } from "vitest";
import { fitsInViewport, originRevealRange } from "./originReveal";

describe("originRevealRange", () => {
  const from = { startLine: 60, startColumn: 19, endLine: 60, endColumn: 26 };

  it("定義（anchor）が無ければ参照元の式だけを対象にする", () => {
    expect(originRevealRange(from, undefined)).toBe(from);
  });

  it("定義が参照元より上にあれば、定義の行から参照元の式までを対象にする", () => {
    const anchor = { path: "a.ts", lineNumber: 52, startColumn: 17, endColumn: 31 };
    expect(originRevealRange(from, anchor)).toEqual({
      startLine: 52,
      startColumn: 17,
      endLine: 60,
      endColumn: 26,
    });
  });

  it("定義が参照元より下にあれば、参照元の式から定義の行までを対象にする", () => {
    const anchor = { path: "a.ts", lineNumber: 80, startColumn: 3, endColumn: 9 };
    expect(originRevealRange(from, anchor)).toEqual({
      startLine: 60,
      startColumn: 19,
      endLine: 80,
      endColumn: 9,
    });
  });
});

describe("fitsInViewport", () => {
  const range = { startLineNumber: 52, endLineNumber: 61 };

  it("範囲の行数が可視行数以下なら収まる", () => {
    expect(fitsInViewport(range, 230, 23)).toBe(true);
  });

  it("範囲の行数が可視行数を超えれば収まらない", () => {
    expect(fitsInViewport(range, 229, 23)).toBe(false);
  });

  it("高さが 0（マウント直後）なら収まらない扱いにする", () => {
    expect(fitsInViewport(range, 0, 23)).toBe(false);
  });

  it("行の高さが 0 以下なら収まらない扱いにする", () => {
    expect(fitsInViewport(range, 230, 0)).toBe(false);
  });
});
