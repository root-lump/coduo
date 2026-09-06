// @vitest-environment jsdom
// view zone の張り替えと高さ反映のテスト。Monaco 実体は使わず、
// changeViewZones の呼び出しを記録する偽エディタで検証する。
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { editor } from "monaco-editor";
import type { CodeAnnotation } from "../../review";
import { useAnnotationViewZones } from "./useAnnotationViewZones";

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
  it("注釈ごとに zone を張り、ブロックの終了行の直後に置く", () => {
    const { instance, zones } = fakeEditor();
    const annotations = [annotationAt("a-1", 3, 7), annotationAt("a-2", 20, 20)];

    const { result } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations,
        mountToken: 1,
      }),
    );

    expect([...zones.values()].map((zone) => zone.afterLineNumber)).toEqual([
      7, 20,
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

  it("注釈が入れ替わったら古い zone を消して張り直す", () => {
    const { instance, zones } = fakeEditor();
    const { rerender } = renderHook(
      ({ annotations }) =>
        useAnnotationViewZones({
          editorInstance: instance,
          annotations,
          mountToken: 1,
        }),
      { initialProps: { annotations: [annotationAt("a-1", 3, 7)] } },
    );
    expect(zones.size).toBe(1);

    rerender({ annotations: [annotationAt("b-1", 40, 42)] });

    expect(zones.size).toBe(1);
    expect([...zones.values()][0].afterLineNumber).toBe(42);
  });

  it("アンマウントで zone を消す", () => {
    const { instance, zones } = fakeEditor();
    const { unmount } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: instance,
        annotations: [annotationAt("a-1", 3, 7)],
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
        mountToken: 1,
      }),
    );

    result.current.setZoneHeight("missing", 210);

    expect(layouts).toEqual([]);
  });

  it("エディタが無ければ zone を作らない", () => {
    const { result } = renderHook(() =>
      useAnnotationViewZones({
        editorInstance: undefined,
        annotations: [annotationAt("a-1", 3, 7)],
        mountToken: 1,
      }),
    );

    expect(result.current.zones).toEqual([]);
  });
});
