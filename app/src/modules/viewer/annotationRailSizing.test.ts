import { describe, expect, it } from "vitest";
import {
  ANNOTATION_RAIL_LIMITS,
  DEFAULT_ANNOTATION_RAIL_WIDTH,
  constrainAnnotationRailWidth,
  isNarrowAnnotationRail,
  loadAnnotationRailWidth,
  parseStoredAnnotationRailWidth,
  saveAnnotationRailWidth,
} from "./annotationRailSizing";

describe("annotation rail sizing", () => {
  it("収まる幅はそのまま返す", () => {
    expect(constrainAnnotationRailWidth(420, 1200)).toBe(420);
  });

  it("下限とエディタ最小幅で挟む", () => {
    expect(constrainAnnotationRailWidth(100, 1200)).toBe(
      ANNOTATION_RAIL_LIMITS.min,
    );
    expect(constrainAnnotationRailWidth(1000, 1200)).toBe(
      1200 - ANNOTATION_RAIL_LIMITS.editorMin,
    );
  });

  it("コンテナが狭くて上限が下限を下回るときは下限を返す", () => {
    expect(constrainAnnotationRailWidth(358, 500)).toBe(
      ANNOTATION_RAIL_LIMITS.min,
    );
  });

  it("数値でない幅は既定幅に置き換える", () => {
    expect(constrainAnnotationRailWidth(Number.NaN, 1200)).toBe(
      DEFAULT_ANNOTATION_RAIL_WIDTH,
    );
    expect(constrainAnnotationRailWidth(358, Number.NaN)).toBe(
      ANNOTATION_RAIL_LIMITS.min,
    );
  });

  it("狭い判定は閾値未満だけ", () => {
    expect(isNarrowAnnotationRail(ANNOTATION_RAIL_LIMITS.narrowBelow)).toBe(
      false,
    );
    expect(isNarrowAnnotationRail(ANNOTATION_RAIL_LIMITS.narrowBelow - 1)).toBe(
      true,
    );
  });

  it("保存値を解釈し、壊れた値は既定幅にする", () => {
    expect(parseStoredAnnotationRailWidth("410")).toBe(410);
    expect(parseStoredAnnotationRailWidth('"wide"')).toBe(
      DEFAULT_ANNOTATION_RAIL_WIDTH,
    );
    expect(parseStoredAnnotationRailWidth("{")).toBe(
      DEFAULT_ANNOTATION_RAIL_WIDTH,
    );
    expect(parseStoredAnnotationRailWidth(null)).toBe(
      DEFAULT_ANNOTATION_RAIL_WIDTH,
    );
  });

  it("ストレージ経由の読み書きと、失敗時の既定値", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    saveAnnotationRailWidth(storage, "k", 390);
    expect(loadAnnotationRailWidth(storage, "k")).toBe(390);

    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveAnnotationRailWidth(broken, "k", 390)).not.toThrow();
    expect(loadAnnotationRailWidth(broken, "k")).toBe(
      DEFAULT_ANNOTATION_RAIL_WIDTH,
    );
    expect(loadAnnotationRailWidth(undefined, "k")).toBe(
      DEFAULT_ANNOTATION_RAIL_WIDTH,
    );
  });
});
