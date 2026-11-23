import { describe, expect, it } from "vitest";
import { mergeForageOrder } from "@/lib/forage/order";
import { forageRanks, inForage, pageTasks, type BoardTask } from "./forage";

// Monday 23 Nov 2026, 14:00 in Shanghai.
const NOW = new Date("2026-11-23T06:00:00Z");
const day = (offset: number) => new Date(Date.UTC(2026, 10, 23 + offset)); // date-only: UTC midnight
let made = 0;
const task = (id: string, deadline: Date | null, extra: Partial<BoardTask> = {}): BoardTask => ({
  id,
  name: `Task ${id}`,
  deadline,
  scheduledDate: null,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, made++)),
  ...extra,
});

describe("what is in Today's Forage", () => {
  it("is an open task due today, tomorrow or overdue; never an undated one", () => {
    expect(inForage(task("a", day(-5)), NOW)).toBe(true);
    expect(inForage(task("b", day(0)), NOW)).toBe(true);
    expect(inForage(task("c", day(1)), NOW)).toBe(true);
    expect(inForage(task("d", day(2)), NOW)).toBe(false);
    expect(inForage(task("e", null), NOW)).toBe(false);
  });

  it("goes by the Shanghai date, whatever the server's clock", () => {
    // 01:00 Tuesday in Shanghai is still Monday in UTC: Wednesday's tasks are "tomorrow" there.
    const earlyTuesday = new Date("2026-11-23T17:00:00Z");
    expect(inForage(task("w", day(2)), earlyTuesday)).toBe(true);
    expect(inForage(task("t", day(3)), earlyTuesday)).toBe(false);
  });
});

describe("the order of Today's Forage", () => {
  const tasks = [task("old", day(-3)), task("mid", day(0)), task("new", day(1)), task("later", day(5))];

  it("is the order David dragged them into, not the order of their dates", () => {
    const ranks = forageRanks(["new", "old", "mid"], tasks, NOW);
    expect([...ranks.keys()]).toEqual(["new", "old", "mid"]);
    expect(ranks.has("later")).toBe(false);
  });

  it("puts tasks he has not placed yet on top, the newest first", () => {
    const fresh = task("fresh", day(0));
    const fresher = task("fresher", day(0));
    expect([...forageRanks(["mid", "old"], [...tasks, fresh, fresher], NOW).keys()]).toEqual([
      "fresher",
      "fresh",
      "new",
      "mid",
      "old",
    ]);
  });

  it("ignores ids that are gone, done or repeated in the saved list", () => {
    expect([...forageRanks(["ghost", "mid", "mid", "later", "old"], tasks, NOW).keys()]).toEqual(["new", "mid", "old"]);
  });

  it("agrees with the page's own rule", () => {
    const saved = ["new", "old", "mid"];
    const forPage = tasks.map((t) => ({
      id: t.id,
      done: false,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    }));
    // Midday, so the page's local-time rule and the Shanghai rule name the same day everywhere.
    expect([...forageRanks(saved, tasks, NOW).keys()]).toEqual(mergeForageOrder(saved, forPage, NOW).visible);
  });
});

describe("the board's three tasks", () => {
  it("are the top three of the Forage, in its order", () => {
    const tasks = [task("a", day(-3)), task("b", day(0)), task("c", day(1)), task("d", day(0)), task("z", day(4))];
    expect(pageTasks(tasks, ["d", "c", "a", "b"], NOW).map((t) => t.title)).toEqual(["Task d", "Task c", "Task a"]);
  });

  it("carry their labels", () => {
    const [first] = pageTasks([task("a", day(-3))], ["a"], NOW);
    expect(first).toEqual({ title: "Task a", due: "overdue", due_abs: "Fri 20 Nov" });
  });

  it("are topped up with what is coming next when the Forage is short", () => {
    const tasks = [
      task("soon", day(3)),
      task("only", day(0)),
      task("sched", null, { scheduledDate: day(2) }),
      task("far", day(9)),
      task("someday", null),
    ];
    expect(pageTasks(tasks, [], NOW).map((t) => t.title)).toEqual(["Task only", "Task sched", "Task soon"]);
  });

  it("are empty when there is nothing at all", () => {
    expect(pageTasks([], ["x"], NOW)).toEqual([]);
  });
});
