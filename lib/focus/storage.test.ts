import { test, expect } from "vitest";
import { parsePending, parseSaved, shouldRetry } from "./storage";
import type { SavedSession } from "./session";

const valid: SavedSession = {
  id: "abc",
  startedAt: 1_000_000,
  plannedMinutes: 25,
  rule: "STRICT",
  taskIds: ["a", "b"],
  ticks: [{ taskId: "a", at: 1_060_000 }],
  hiddenAt: null,
  ended: null,
};

test.each([[null], ["{"], ['{"startedAt":"x"}'], [""], ["[]"], ["null"]])(
  "parseSaved rejects %j",
  (raw) => expect(parseSaved(raw)).toBeNull(),
);
test("parseSaved rejects plannedMinutes 45", () => {
  expect(parseSaved(JSON.stringify({ ...valid, plannedMinutes: 45 }))).toBeNull();
});
test("parseSaved rejects bad rule, ticks and ended", () => {
  expect(parseSaved(JSON.stringify({ ...valid, rule: "LOOSE" }))).toBeNull();
  expect(parseSaved(JSON.stringify({ ...valid, ticks: [{ taskId: 1, at: 2 }] }))).toBeNull();
  expect(parseSaved(JSON.stringify({ ...valid, ended: { outcome: "WON", at: 1, synced: false } }))).toBeNull();
});
test("parseSaved round-trips a valid session", () => {
  expect(parseSaved(JSON.stringify(valid))).toEqual(valid);
});
test("parseSaved round-trips an ended session", () => {
  const ended = { ...valid, id: null, hiddenAt: 5, ended: { outcome: "LEFT" as const, at: 9, synced: false } };
  expect(parseSaved(JSON.stringify(ended))).toEqual(ended);
});

test("parsePending handles null and malformed input", () => {
  expect(parsePending(null)).toEqual([]);
  expect(parsePending("{")).toEqual([]);
  expect(parsePending('{"a":1}')).toEqual([]);
});
test("parsePending keeps only the valid entries", () => {
  expect(parsePending(JSON.stringify([valid, { startedAt: "x" }]))).toEqual([valid]);
});

test.each([[401, true], [429, true], [500, true], [503, true], [400, false], [404, false], [409, false]])(
  "shouldRetry(%i) is %s",
  (status, want) => expect(shouldRetry(status)).toBe(want),
);
