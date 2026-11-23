import { describe, expect, it } from "vitest";
import {
  isForageTask,
  mergeForageOrder,
  moveForageItem,
  parseForageOrder,
  serializeForageOrder,
  MAX_SAVED_IDS,
} from "./order";

const NOW = new Date(2026, 10, 23, 9, 0); // Mon 23 Nov 2026, 9am local

function task(id: string, deadline: string | null, createdAt: string, done = false) {
  return { id, deadline, createdAt, done };
}

describe("isForageTask", () => {
  it("includes overdue, today and tomorrow; excludes later, undated and done", () => {
    expect(isForageTask(task("a", "2026-11-20", "2026-11-01"), NOW)).toBe(true);
    expect(isForageTask(task("b", "2026-11-23", "2026-11-01"), NOW)).toBe(true);
    expect(isForageTask(task("c", "2026-11-24", "2026-11-01"), NOW)).toBe(true);
    expect(isForageTask(task("d", "2026-11-25", "2026-11-01"), NOW)).toBe(false);
    expect(isForageTask(task("e", null, "2026-11-01"), NOW)).toBe(false);
    expect(isForageTask(task("f", "2026-11-23", "2026-11-01", true), NOW)).toBe(false);
  });
});

describe("mergeForageOrder", () => {
  const a = task("a", "2026-11-20", "2026-11-10T01:00:00Z");
  const b = task("b", "2026-11-23", "2026-11-11T01:00:00Z");
  const c = task("c", "2026-11-24", "2026-11-12T01:00:00Z");

  it("keeps a dragged order exactly", () => {
    const m = mergeForageOrder(["c", "a", "b"], [a, b, c], NOW);
    expect(m.visible).toEqual(["c", "a", "b"]);
  });

  it("puts a newly added task on top, above the dragged order", () => {
    const n = task("n", "2026-11-23", "2026-11-23T01:00:00Z");
    const m = mergeForageOrder(["c", "a", "b"], [n, a, b, c], NOW);
    expect(m.visible).toEqual(["n", "c", "a", "b"]);
  });

  it("puts a newly added task on top even when it is due later than the rest", () => {
    const n = task("n", "2026-11-24", "2026-11-23T01:00:00Z");
    const m = mergeForageOrder(["a", "b"], [a, b, n], NOW);
    expect(m.visible[0]).toBe("n");
  });

  it("stacks several newcomers newest first", () => {
    const n1 = task("n1", "2026-11-23", "2026-11-23T01:00:00Z");
    const n2 = task("n2", "2026-11-23", "2026-11-23T02:00:00Z");
    const m = mergeForageOrder(["a"], [a, n1, n2], NOW);
    expect(m.visible).toEqual(["n2", "n1", "a"]);
  });

  it("a newcomer, once saved, stays where it is and the next one goes above it", () => {
    const n1 = task("n1", "2026-11-23", "2026-11-23T01:00:00Z");
    const first = mergeForageOrder(["b", "a"], [a, b, n1], NOW);
    const saved = parseForageOrder(serializeForageOrder(first));
    const n2 = task("n2", "2026-11-23", "2026-11-23T02:00:00Z");
    const second = mergeForageOrder(saved, [a, b, n1, n2], NOW);
    expect(second.visible).toEqual(["n2", "n1", "b", "a"]);
  });

  it("drops tasks that are done or no longer due soon, keeping the rest in place", () => {
    const bDone = { ...b, done: true };
    const cLater = { ...c, deadline: "2026-12-01" };
    const m = mergeForageOrder(["c", "b", "a"], [a, bDone, cLater], NOW);
    expect(m.visible).toEqual(["a"]);
    expect(m.elsewhere).toEqual([]);
  });

  it("keeps ids from the other mode so switching modes doesn't wipe them", () => {
    const m = mergeForageOrder(["p1", "b", "p2", "a"], [a, b], NOW);
    expect(m.visible).toEqual(["b", "a"]);
    expect(m.elsewhere).toEqual(["p1", "p2"]);
    expect(parseForageOrder(serializeForageOrder(m))).toEqual(["b", "a", "p1", "p2"]);
  });

  it("carries yesterday's order into a new day", () => {
    // Yesterday you dragged b above a. Today c has come into range.
    const m = mergeForageOrder(["b", "a"], [a, b, c], NOW);
    expect(m.visible).toEqual(["c", "b", "a"]);
  });

  it("ignores duplicate ids and caps the saved list", () => {
    const many = Array.from({ length: MAX_SAVED_IDS + 50 }, (_, i) => `x${i}`);
    const m = mergeForageOrder(["a", "a", ...many], [a], NOW);
    expect(m.visible).toEqual(["a"]);
    expect(m.visible.length + m.elsewhere.length).toBe(MAX_SAVED_IDS);
  });
});

describe("parseForageOrder", () => {
  it("survives empty and corrupt values", () => {
    expect(parseForageOrder("")).toEqual([]);
    expect(parseForageOrder(null)).toEqual([]);
    expect(parseForageOrder("not json")).toEqual([]);
    expect(parseForageOrder('{"a":1}')).toEqual([]);
    expect(parseForageOrder('["a",2,"b"]')).toEqual(["a", "b"]);
  });
});

describe("moveForageItem", () => {
  it("moves one item like a drag", () => {
    expect(moveForageItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveForageItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
});
