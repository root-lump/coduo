import { describe, expect, it } from "vitest";
import {
  EMPTY_PANE_TRANSITION,
  renderedOrigins,
  settleLeaving,
  transitionPanes,
  type PaneTransition,
} from "./paneTransition";

type Pane = { depth: number; name: string };
const pane = (depth: number, name = `pane-${depth}`): Pane => ({ depth, name });
const empty = EMPTY_PANE_TRANSITION as PaneTransition<Pane>;

describe("transitionPanes", () => {
  it("marks a new depth as entering", () => {
    const result = transitionPanes([pane(0)], [pane(0), pane(1)], empty);
    expect([...result.entering]).toEqual([1]);
    expect(result.leaving.size).toBe(0);
  });

  it("keeps a removed depth as leaving with its previous content", () => {
    const middle = pane(1, "middle");
    const result = transitionPanes([pane(0), middle], [pane(0)], empty);
    expect(result.entering.size).toBe(0);
    expect(result.leaving.get(1)).toBe(middle);
    expect(
      renderedOrigins([pane(0)], result.leaving).map((origin) => origin.depth),
    ).toEqual([0, 1]);
  });

  it("slides the window when a third jump pushes the oldest pane out", () => {
    const result = transitionPanes(
      [pane(0), pane(1)],
      [pane(1), pane(2)],
      empty,
    );
    expect([...result.leaving.keys()]).toEqual([0]);
    expect([...result.entering]).toEqual([2]);
    expect(
      renderedOrigins([pane(1), pane(2)], result.leaving).map(
        (origin) => origin.depth,
      ),
    ).toEqual([0, 1, 2]);
  });

  it("keeps earlier leaving panes that are still gone", () => {
    const first = transitionPanes([pane(0), pane(1)], [pane(0)], empty);
    const second = transitionPanes([pane(0)], [], first);
    expect([...second.leaving.keys()].sort()).toEqual([0, 1]);
  });

  it("takes a returning depth out of leaving without marking it entering", () => {
    const leaving = transitionPanes([pane(0), pane(1)], [pane(0)], empty);
    const back = transitionPanes([pane(0)], [pane(0), pane(1)], leaving);
    expect(back.leaving.size).toBe(0);
    expect(back.entering.size).toBe(0);
  });

  it("does not mutate its inputs", () => {
    const previous = [pane(0), pane(1)];
    const next = [pane(1), pane(2)];
    const current: PaneTransition<Pane> = {
      entering: new Set([1]),
      leaving: new Map([[3, pane(3)]]),
    };
    transitionPanes(previous, next, current);
    renderedOrigins(next, current.leaving);
    settleLeaving(current);
    expect(previous.map((origin) => origin.depth)).toEqual([0, 1]);
    expect(next.map((origin) => origin.depth)).toEqual([1, 2]);
    expect([...current.entering]).toEqual([1]);
    expect([...current.leaving.keys()]).toEqual([3]);
  });
});

describe("settleLeaving", () => {
  it("drops every leaving pane and keeps entering", () => {
    const current: PaneTransition<Pane> = {
      entering: new Set([2]),
      leaving: new Map([[0, pane(0)]]),
    };
    const settled = settleLeaving(current);
    expect(settled.leaving.size).toBe(0);
    expect(settled.entering).toBe(current.entering);
  });

  it("returns the same state when nothing is leaving", () => {
    expect(settleLeaving(empty)).toBe(empty);
  });
});
