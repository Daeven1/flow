import { test, expect } from "vitest";
import { parseStart, parseEnd } from "./validate";

test("parseStart accepts a valid body", () => {
  expect(parseStart({ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] }))
    .toEqual({ startedAt: new Date("2026-11-19T02:00:00.000Z"), plannedMinutes: 25, rule: "STRICT", taskIds: ["a"], plant: null });
});
test("parseStart keeps a valid plant choice", () => {
  const base = { startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] };
  expect(parseStart({ ...base, plant: { species: "FERN", x: 1, y: -2 } })?.plant)
    .toEqual({ species: "FERN", x: 1, y: -2 });
});
test("parseStart drops a missing or invalid plant without rejecting", () => {
  const base = { startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] };
  expect(parseStart(base)?.plant).toBeNull();
  expect(parseStart({ ...base, plant: null })?.plant).toBeNull();
  const bad = parseStart({ ...base, plant: { species: "OAK", x: 0, y: 0 } });
  expect(bad).not.toBeNull();
  expect(bad?.plant).toBeNull();
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
    segments: [{ taskId: "a", minutes: 20 }, { taskId: "b", minutes: 20 }] }, 25)?.segments)
    .toEqual([{ taskId: "a", minutes: 20 }, { taskId: "b", minutes: 5 }]);
  expect(parseEnd({ outcome: "WON", endedAt: "2026-11-19T02:25:00.000Z", segments: [] }, 25)).toBeNull();
});
test("parseEnd clamps a negative segment to 0 and an over-length one to the plan", () => {
  const e = "2026-11-19T02:25:00.000Z";
  expect(parseEnd({ outcome: "COMPLETED", endedAt: e, segments: [{ taskId: "a", minutes: -4 }] }, 25)?.segments)
    .toEqual([{ taskId: "a", minutes: 0 }]);
  expect(parseEnd({ outcome: "COMPLETED", endedAt: e, segments: [{ taskId: "a", minutes: 90 }] }, 25)?.segments)
    .toEqual([{ taskId: "a", minutes: 25 }]);
});
test("parseEnd trims overflow across several segments, never below 0", () => {
  const e = "2026-11-19T02:25:00.000Z";
  const out = parseEnd({ outcome: "COMPLETED", endedAt: e,
    segments: [{ taskId: "a", minutes: 25 }, { taskId: "b", minutes: 10 }, { taskId: "c", minutes: 10 }] }, 25);
  expect(out?.segments).toEqual([{ taskId: "a", minutes: 25 }, { taskId: "b", minutes: 0 }, { taskId: "c", minutes: 0 }]);
});
