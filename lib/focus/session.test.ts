import { describe, expect, test } from "vitest";
import {
  defaultRule,
  formatClock,
  judge,
  progress,
  remainingMs,
  segments,
  type SavedSession,
} from "./session";

const MIN = 60_000;
const T0 = 1_800_000_000_000;

function base(over: Partial<SavedSession> = {}): SavedSession {
  return {
    id: null,
    startedAt: T0,
    plannedMinutes: 25,
    rule: "GENTLE",
    taskIds: ["a", "b"],
    ticks: [],
    hiddenAt: null,
    ended: null,
    plant: null,
    ...over,
  };
}

describe("focus session", () => {
  test("remaining and progress come from the start time", () => {
    expect(remainingMs(base(), T0 + 10 * MIN)).toBe(15 * MIN);
    expect(progress(base(), T0 + 10 * MIN)).toBeCloseTo(0.4);
    expect(remainingMs(base(), T0 + 99 * MIN)).toBe(0);
    expect(progress(base(), T0 + 99 * MIN)).toBe(1);
  });
  test("default rule is strict only on a small touch device", () => {
    expect(defaultRule({ coarsePointer: true, width: 390 })).toBe("STRICT");
    expect(defaultRule({ coarsePointer: true, width: 1024 })).toBe("GENTLE");
    expect(defaultRule({ coarsePointer: false, width: 390 })).toBe("GENTLE");
  });
  test("running session is not judged", () => {
    expect(judge(base(), T0 + 5 * MIN)).toBeNull();
  });
  test("gentle: hidden for a long time changes nothing", () => {
    expect(judge(base({ hiddenAt: T0 + MIN }), T0 + 20 * MIN)).toBeNull();
  });
  test("gentle: back after the end is completed at the end time", () => {
    expect(judge(base({ hiddenAt: T0 + MIN }), T0 + 3 * 60 * MIN))
      .toEqual({ outcome: "COMPLETED", at: T0 + 25 * MIN });
  });
  test("strict: away within the grace period is forgiven", () => {
    expect(judge(base({ rule: "STRICT", hiddenAt: T0 + MIN }), T0 + MIN + 10_000)).toBeNull();
  });
  test("strict: away past the grace period loses the session", () => {
    expect(judge(base({ rule: "STRICT", hiddenAt: T0 + MIN }), T0 + MIN + 10_001))
      .toEqual({ outcome: "LEFT", at: T0 + MIN + 10_000 });
  });
  test("strict: hidden in the last few seconds still completes", () => {
    expect(judge(base({ rule: "STRICT", hiddenAt: T0 + 25 * MIN - 5_000 }), T0 + 60 * MIN))
      .toEqual({ outcome: "COMPLETED", at: T0 + 25 * MIN });
  });
  test("ticking every task clears the session early", () => {
    const s = base({ ticks: [{ taskId: "a", at: T0 + 4 * MIN }, { taskId: "b", at: T0 + 9 * MIN }] });
    expect(judge(s, T0 + 9 * MIN)).toEqual({ outcome: "CLEARED", at: T0 + 9 * MIN });
  });
  test("an ended session keeps its outcome", () => {
    const s = base({ ended: { outcome: "GAVE_UP", at: T0 + 2 * MIN, synced: false } });
    expect(judge(s, T0 + 60 * MIN)).toEqual({ outcome: "GAVE_UP", at: T0 + 2 * MIN });
  });
  test("segments split minutes by task and never exceed the plan", () => {
    const s = base({ ticks: [{ taskId: "a", at: T0 + 10 * MIN }] });
    expect(segments(s, T0 + 3 * 60 * MIN)).toEqual([
      { taskId: "a", minutes: 10 }, { taskId: "b", minutes: 15 },
    ]);
  });
  test("segments drop tasks that got no time", () => {
    const s = base({ ticks: [{ taskId: "a", at: T0 + 10_000 }, { taskId: "b", at: T0 + 9 * MIN }] });
    expect(segments(s, T0 + 9 * MIN)).toEqual([{ taskId: "b", minutes: 9 }]);
  });
  test("segments round cumulatively so the total never exceeds the plan", () => {
    const s = base({
      taskIds: ["a", "b", "c"],
      ticks: [
        { taskId: "a", at: T0 + 8 * MIN + 36_000 },
        { taskId: "b", at: T0 + 17 * MIN + 12_000 },
      ],
    });
    const out = segments(s, T0 + 25 * MIN);
    expect(out).toEqual([
      { taskId: "a", minutes: 9 }, { taskId: "b", minutes: 8 }, { taskId: "c", minutes: 8 },
    ]);
    expect(out.reduce((n, x) => n + x.minutes, 0)).toBeLessThanOrEqual(25);
  });
  test("segments cumulative rounding when the list is cleared just before the end", () => {
    const s = base({
      taskIds: ["a", "b", "c"],
      ticks: [
        { taskId: "a", at: T0 + 8 * MIN + 30_000 },
        { taskId: "b", at: T0 + 17 * MIN },
        { taskId: "c", at: T0 + 24 * MIN + 54_000 },
      ],
    });
    const out = segments(s, T0 + 24 * MIN + 54_000);
    expect(out).toEqual([
      { taskId: "a", minutes: 9 }, { taskId: "b", minutes: 8 }, { taskId: "c", minutes: 8 },
    ]);
    expect(out.reduce((n, x) => n + x.minutes, 0)).toBeLessThanOrEqual(25);
  });
  test("clock text", () => {
    expect(formatClock(24 * MIN + 6_200)).toBe("24:07");
    expect(formatClock(0)).toBe("0:00");
  });
});
