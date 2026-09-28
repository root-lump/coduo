import { describe, expect, it } from "vitest";
import { pruneCollapsed, toggleCollapsed } from "./paneCollapse";

describe("toggleCollapsed", () => {
  it("adds a depth that is expanded and removes one that is collapsed", () => {
    const collapsed = toggleCollapsed(new Set(), 1);
    expect([...collapsed]).toEqual([1]);
    expect([...toggleCollapsed(collapsed, 0)].sort()).toEqual([0, 1]);
    expect([...toggleCollapsed(collapsed, 1)]).toEqual([]);
  });

  it("does not mutate the given set", () => {
    const collapsed = new Set([0]);
    toggleCollapsed(collapsed, 1);
    expect([...collapsed]).toEqual([0]);
  });
});

describe("pruneCollapsed", () => {
  it("expands the bottom pane and anything deeper", () => {
    expect([...pruneCollapsed(new Set([0, 1, 2, 3]), 2)].sort()).toEqual([0, 1]);
  });

  it("clears everything when all jumps are closed", () => {
    expect([...pruneCollapsed(new Set([0, 1]), 0)]).toEqual([]);
  });

  it("returns the same set when nothing changes", () => {
    const collapsed = new Set([0, 1]);
    expect(pruneCollapsed(collapsed, 2)).toBe(collapsed);
    const empty = new Set<number>();
    expect(pruneCollapsed(empty, 0)).toBe(empty);
  });
});
