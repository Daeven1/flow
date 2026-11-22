import { describe, expect, it } from "vitest";
import { boardFor, dueAbs, dueLabel, shortTitle, topTasks, type FeedTask } from "./idle";

// Thursday 19 Nov 2026, 17:42 in Shanghai.
const NOW = new Date("2026-11-19T09:42:00Z");
const day = (offset: number) => new Date(Date.UTC(2026, 10, 19 + offset)); // date-only: UTC midnight
const task = (name: string, deadline: Date | null, scheduledDate: Date | null = null): FeedTask =>
  ({ name, deadline, scheduledDate });

describe("due labels", () => {
  it("are short and ready to draw", () => {
    expect(dueLabel(null, NOW)).toBeNull();
    expect(dueLabel(day(-2), NOW)).toBe("overdue");
    expect(dueLabel(day(0), NOW)).toBe("today");
    expect(dueLabel(day(1), NOW)).toBe("tomorrow");
    expect(dueLabel(day(3), NOW)).toBe("Sun");
    expect(dueLabel(day(7), NOW)).toBe("26 Nov");
  });

  it("count a timed deadline by its Shanghai date", () => {
    // 23:30 Shanghai on the 19th is 15:30 UTC the same day; 00:30 Shanghai on the 20th is 16:30 UTC on the 19th.
    expect(dueLabel(new Date("2026-11-19T15:30:00Z"), NOW)).toBe("today");
    expect(dueLabel(new Date("2026-11-19T16:30:00Z"), NOW)).toBe("tomorrow");
  });

  it("have an absolute form for a page that stays on the glass", () => {
    expect(dueAbs(day(0), NOW)).toBe("Thu 19 Nov");
    expect(dueAbs(new Date(Date.UTC(2026, 11, 2)), NOW)).toBe("Wed 2 Dec");
    expect(dueAbs(null, NOW)).toBeNull();
  });

  it("never exceed the board's ten characters", () => {
    for (let offset = -3; offset < 40; offset++) {
      expect(dueLabel(day(offset), NOW)!.length).toBeLessThanOrEqual(10);
      expect(dueAbs(day(offset), NOW)!.length).toBeLessThanOrEqual(10);
    }
  });
});

describe("titles", () => {
  it("only use characters the board's fonts can draw", () => {
    expect(shortTitle("Buy  🎂 cake\nfor   Ava’s party — café")).toBe("Buy cake for Ava’s party — café");
    expect(shortTitle("给学生发邮件 re: Onshape")).toBe("re: Onshape");
    expect(shortTitle("作业")).toBe("(untitled)");
    expect(shortTitle("Tabs\tand odd spaces")).toBe("Tabs and odd spaces");
  });

  it("are cut at a word with an ellipsis", () => {
    const long =
      "Write the Year 9 design unit reflection and send it to the whole department before Friday, then file the moderation samples";
    const cut = shortTitle(long);
    expect(cut.length).toBeLessThanOrEqual(80);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.startsWith("Write the Year 9 design unit")).toBe(true);
  });
});

describe("the top three", () => {
  it("are the soonest, overdue first, the deadline winning over the scheduled date", () => {
    const tasks = [
      task("Next week", day(8)),
      task("Scheduled today, was due Monday", day(-3), day(0)),
      task("Tomorrow's", null, day(1)),
      task("Today's", day(0)),
    ];
    expect(topTasks(tasks, NOW)).toEqual([
      { title: "Scheduled today, was due Monday", due: "overdue", due_abs: "Mon 16 Nov" },
      { title: "Today's", due: "today", due_abs: "Thu 19 Nov" },
      { title: "Tomorrow's", due: "tomorrow", due_abs: "Fri 20 Nov" },
    ]);
  });

  it("put undated tasks last", () => {
    expect(topTasks([task("Someday", null), task("Soon", day(1))], NOW).map((t) => t.title)).toEqual([
      "Soon",
      "Someday",
    ]);
  });
});

describe("which board is asking", () => {
  const boards = JSON.stringify({
    "44:B1:76:B6:A2:10": { token: "secret-token", email: "d@example.com", owner: "David" },
  });

  it("knows a listed board with its token, whatever the case of its id", () => {
    expect(boardFor(boards, "44:b1:76:b6:a2:10", "Bearer secret-token")).toEqual({
      email: "d@example.com",
      owner: "David",
    });
  });

  it("refuses a wrong token, a missing one, a stranger, and a broken list", () => {
    expect(boardFor(boards, "44:b1:76:b6:a2:10", "Bearer wrong-token!")).toBeNull();
    expect(boardFor(boards, "44:b1:76:b6:a2:10", null)).toBeNull();
    expect(boardFor(boards, "aa:bb:cc:dd:ee:ff", "Bearer secret-token")).toBeNull();
    expect(boardFor(boards, null, "Bearer secret-token")).toBeNull();
    expect(boardFor("not json", "44:b1:76:b6:a2:10", "Bearer secret-token")).toBeNull();
    expect(boardFor(undefined, "44:b1:76:b6:a2:10", "Bearer secret-token")).toBeNull();
    const empty = JSON.stringify({ "44:b1:76:b6:a2:10": { token: "", email: "d@example.com", owner: "David" } });
    expect(boardFor(empty, "44:b1:76:b6:a2:10", "Bearer ")).toBeNull();
  });
});
