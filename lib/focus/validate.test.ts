import { test, expect } from "vitest";
import { parseStart, parseEnd } from "./validate";

test("parseStart accepts a valid body", () => {
  expect(parseStart({ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] }))
    .toEqual({ startedAt: new Date("2026-11-19T02:00:00.000Z"), plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] });
});
test.each([
  [{ startedAt: "nope", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] }],
  [{ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 45, rule: "STRICT", taskIds: ["a"] }],
  [{ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "LOOSE", taskIds: ["a"] }],
  [{ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: [] }],
  [null],
])("parseStart rejects %j", (body) => expect(parseStart(body)).toBeNull());
test("parseEnd clamps and totals", () => {
  const ok = parseEnd({ outcome: "CLEARED", endedAt: "2026-11-19T02:09:00.000Z", segments: [{ taskId: "a", minutes: 9 }] }, 25);
  expect(ok?.segments).toEqual([{ taskId: "a", minutes: 9 }]);
  expect(parseEnd({ outcome: "COMPLETED", endedAt: "2026-11-19T02:25:00.000Z",
    segments: [{ taskId: "a", minutes: 20 }, { taskId: "b", minutes: 20 }] }, 25)).toBeNull();
  expect(parseEnd({ outcome: "WON", endedAt: "2026-11-19T02:25:00.000Z", segments: [] }, 25)).toBeNull();
});
