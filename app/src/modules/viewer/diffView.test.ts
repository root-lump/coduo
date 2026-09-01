import { describe, expect, it } from "vitest";
import { shouldOfferDiff } from "./diffView";

describe("shouldOfferDiff", () => {
  it("変更前を復元できていて、変更後と差があるなら出す", () => {
    expect(shouldOfferDiff({ baseText: "a", headText: "b" })).toBe(true);
  });

  it("追加ファイル（変更前が空）でも出す", () => {
    expect(shouldOfferDiff({ baseText: "", headText: "a" })).toBe(true);
  });

  it("変更前を復元できていないなら出さない", () => {
    expect(shouldOfferDiff({ headText: "a" })).toBe(false);
  });

  it("ファイルを開いていないなら出さない", () => {
    expect(shouldOfferDiff({ baseText: "a" })).toBe(false);
  });

  it("変更前と変更後が同じなら出さない", () => {
    expect(shouldOfferDiff({ baseText: "a", headText: "a" })).toBe(false);
  });
});
