// @vitest-environment jsdom
// view zone の張り替えと高さ反映のテスト。Monaco 実体は使わず、
// changeViewZones の呼び出しを記録する偽エディタで検証する。
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { editor } from "monaco-editor";
import type { CodeAnnotation } from "../../review";
import {
  originalLineForSpacer,
  useAnnotationViewZones,
} from "./useAnnotationViewZones";

const LINE_HEIGHT = 20;

function fakeEditor(lineCount = 100) {
  const zones = new Map<string, editor.IViewZone>();
  const layouts: string[] = [];
  let nextId = 1;
  const accessor: editor.IViewZoneChangeAccessor = {
    addZone(zone) {
      const id = `zone-${nextId++}`;
      zones.set(id, zone);
      return id;
    },
    removeZone(id) {
      zones.delete(id);
    },
    layoutZone(id) {
      layouts.push(id);
    },
  };
  const instance = {
    getModel: () => ({ getLineCount: () => lineCount }),
    getTopForLineNumber: (line: number) => (line - 1) * LINE_HEIGHT,
    changeViewZones: (callback: (a: editor.IViewZoneChangeAccessor) => void) =>
      callback(accessor),
  } as unknown as editor.ICodeEditor;
  return { instance, zones, layouts };
}

const annotationAt = (id: string, startLine: number, endLine: number) =>
  ({
    id,
    label: id,
    explanation: id,
    target: { file: "src/lib.rs", range: { startLine, endLine } },
  }) satisfies CodeAnnotation;

describe("useAnnotationViewZones", () => {
  it("注釈ごとに zone を張り、ブロックの開始行の直前に置く", () => {
    const { instance, zones } = fakeEditor();
    const annotations = [annotationAt("a-1", 3, 7), annotationAt("a-2", 20, 20)];

    const { result } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations,
        changedLines: [],
        mountToken: 1,
      }),
    );

    // カードはブロックの上に出るので、開始行の 1 つ前に置く。
    expect([...zones.values()].map((zone) => zone.afterLineNumber)).toEqual([
      2, 19,
    ]);
    expect(result.current.zones.map((zone) => zone.annotationId)).toEqual([
      "a-1",
      "a-2",
    ]);
    expect(
      result.current.zones.every((zone) =>
        zone.domNode.classList.contains("code-annotation-zone"),
      ),
    ).toBe(true);
  });

  it("1 行目に付いた注釈は先頭行の前（0）に置く", () => {
    const { instance, zones } = fakeEditor();

    renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations: [annotationAt("a-1", 1, 3)],
        changedLines: [],
        mountToken: 1,
      }),
    );

    expect([...zones.values()][0].afterLineNumber).toBe(0);
  });

  it("注釈が入れ替わったら古い zone を消して張り直す", () => {
    const { instance, zones } = fakeEditor();
    const { rerender } = renderHook(
      ({ annotations }) =>
        useAnnotationViewZones({
          editorInstance: instance,
          annotations,
          changedLines: [],
          mountToken: 1,
        }),
      { initialProps: { annotations: [annotationAt("a-1", 3, 7)] } },
    );
    expect(zones.size).toBe(1);

    rerender({ annotations: [annotationAt("b-1", 40, 42)] });

    expect(zones.size).toBe(1);
    expect([...zones.values()][0].afterLineNumber).toBe(39);
  });

  it("アンマウントで zone を消す", () => {
    const { instance, zones } = fakeEditor();
    const { unmount } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations: [annotationAt("a-1", 3, 7)],
        changedLines: [],
        mountToken: 1,
      }),
    );

    unmount();

    expect(zones.size).toBe(0);
  });

  it("高さが変わったときだけ layoutZone を呼ぶ", () => {
    const { instance, zones, layouts } = fakeEditor();
    const { result } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations: [annotationAt("a-1", 3, 7)],
        changedLines: [],
        mountToken: 1,
      }),
    );

    result.current.setZoneHeight("a-1", 210);
    result.current.setZoneHeight("a-1", 210);
    // 高さが測れていない（0）ときは初期値のままにする。
    result.current.setZoneHeight("a-1", 0);
    // 1px 未満の差は往復の元になるので反映しない。
    result.current.setZoneHeight("a-1", 210.4);

    expect(layouts).toEqual(["zone-1"]);
    expect([...zones.values()][0].heightInPx).toBe(210);
  });

  it("知らない注釈の高さは無視する", () => {
    const { instance, layouts } = fakeEditor();
    const { result } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations: [annotationAt("a-1", 3, 7)],
        changedLines: [],
        mountToken: 1,
      }),
    );

    result.current.setZoneHeight("missing", 210);

    expect(layouts).toEqual([]);
  });

  it("差分の色のクラスを本文側と余白側の両方に付ける", () => {
    const { instance, zones } = fakeEditor();

    renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations: [annotationAt("a-1", 5, 9), annotationAt("a-2", 20, 20)],
        changedLines: [{ line: 5, kind: "added" }],
        mountToken: 1,
      }),
    );

    const [first, second] = [...zones.values()];
    expect(first.domNode.className).toBe("code-annotation-zone is-added");
    expect(first.marginDomNode?.className).toBe(
      "code-annotation-zone-margin is-added",
    );
    // 先頭行が変更行でなければ色は付けない。
    expect(second.domNode.className).toBe("code-annotation-zone");
  });

  it("差分エディタでは元ファイル側にも同じ高さの空きを対で挿す", () => {
    const modified = fakeEditor();
    const original = fakeEditor();
    const diffEditor = {
      getOriginalEditor: () => original.instance,
      // 元の 20-30 行が、変更後の 20-25 行に置き換わったかたまり。
      getLineChanges: () => [
        {
          originalStartLineNumber: 20,
          originalEndLineNumber: 30,
          modifiedStartLineNumber: 20,
          modifiedEndLineNumber: 25,
        },
      ],
    } as unknown as editor.IDiffEditor;

    const { result, unmount } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: modified.instance,
        annotations: [annotationAt("a-1", 22, 24)],
        changedLines: [],
        diffEditor,
        diffToken: 1,
        mountToken: 1,
      }),
    );

    expect(modified.zones.size).toBe(1);
    expect(original.zones.size).toBe(1);
    const [modifiedZone] = [...modified.zones.values()];
    const [originalZone] = [...original.zones.values()];
    expect(modifiedZone.afterLineNumber).toBe(21);
    // かたまりの内側なので、元ファイル側はかたまりの最後（30 行目）の後ろに置く。
    expect(originalZone.afterLineNumber).toBe(30);
    expect(originalZone.heightInPx).toBe(modifiedZone.heightInPx);

    result.current.setZoneHeight("a-1", 260);
    expect(modifiedZone.heightInPx).toBe(260);
    expect(originalZone.heightInPx).toBe(260);

    unmount();
    expect(modified.zones.size).toBe(0);
    expect(original.zones.size).toBe(0);
  });

  it("エディタが無ければ zone を作らない", () => {
    const { result } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: undefined,
        annotations: [annotationAt("a-1", 3, 7)],
        changedLines: [],
        mountToken: 1,
      }),
    );

    expect(result.current.zones).toEqual([]);
  });
});

describe("originalLineForSpacer", () => {
  // 元の 20-30 行が、変更後の 20-25 行に置き換わったかたまり。
  const replace = [
    {
      originalStartLineNumber: 20,
      originalEndLineNumber: 30,
      modifiedStartLineNumber: 20,
      modifiedEndLineNumber: 25,
    },
  ] as editor.ILineChange[];

  it("かたまりの内側なら、そのかたまりの元ファイル側の最後の行", () => {
    expect(originalLineForSpacer(22, replace)).toBe(30);
    expect(originalLineForSpacer(20, replace)).toBe(30);
    expect(originalLineForSpacer(25, replace)).toBe(30);
  });

  it("かたまりより前は、そのまま 1 つ前の行", () => {
    expect(originalLineForSpacer(10, replace)).toBe(9);
  });

  it("かたまりより後ろは、増減のぶんずれる", () => {
    // 11 行消えて 6 行入ったので、5 行ぶん後ろ。
    expect(originalLineForSpacer(40, replace)).toBe(44);
  });

  it("挿入だけのかたまりは、挿入位置の行", () => {
    const insert = [
      {
        originalStartLineNumber: 12,
        originalEndLineNumber: 0,
        modifiedStartLineNumber: 13,
        modifiedEndLineNumber: 15,
      },
    ] as editor.ILineChange[];
    expect(originalLineForSpacer(14, insert)).toBe(12);
  });

  it("差分が無ければ 1 つ前の行", () => {
    expect(originalLineForSpacer(42, [])).toBe(41);
  });
});
