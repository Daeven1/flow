import { test, expect } from "vitest";
import { droppedReason, parsePending, parseSaved, shouldRetry } from "./storage";
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
  plant: null,
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
test("parseSaved rejects an empty id and an empty task list", () => {
  expect(parseSaved(JSON.stringify({ ...valid, id: "" }))).toBeNull();
  expect(parseSaved(JSON.stringify({ ...valid, taskIds: [] }))).toBeNull();
  expect(parseSaved(JSON.stringify({ ...valid, id: null }))).toEqual({ ...valid, id: null });
});
test("parseSaved round-trips a valid session", () => {
  expect(parseSaved(JSON.stringify(valid))).toEqual(valid);
});
test("parseSaved reads a piece-1 session with no plant key as plant null", () => {
  const { plant: _p, ...old } = valid;
  expect(parseSaved(JSON.stringify(old))).toEqual({ ...valid, plant: null });
});
test("parseSaved round-trips a valid plant", () => {
  const planted = { ...valid, plant: { species: "WILDFLOWERS" as const, x: -1, y: -1 } };
  expect(parseSaved(JSON.stringify(planted))).toEqual(planted);
});
test("parseSaved turns an invalid plant into null without rejecting the session", () => {
  const bad = { ...valid, plant: { species: "OAK", x: 0, y: 0 } };
  expect(parseSaved(JSON.stringify(bad))).toEqual({ ...valid, plant: null });
});
test("parseSaved round-trips an ended session", () => {
  const ended = { ...valid, id: null, hiddenAt: 5, ended: { outcome: "LEFT" as const, at: 9, synced: false } };
  expect(parseSaved(JSON.stringify(ended))).toEqual(ended);
});

test("a successful session restores its original break deadline", () => {
  const ended = { outcome: "CLEARED", at: 1_070_000, synced: true };
  const onBreak = { ...valid, ended, breakEndsAt: 1_500_000 };
  expect(parseSaved(JSON.stringify(onBreak))).toEqual(onBreak);
  for (const breakEndsAt of [ended.at, "1_500_000", null]) {
    expect(parseSaved(JSON.stringify({ ...onBreak, breakEndsAt }))).toEqual({ ...valid, ended });
  }
  for (const outcome of ["GAVE_UP", "LEFT"]) {
    const failed = { ...valid, ended: { ...ended, outcome } };
    expect(parseSaved(JSON.stringify({ ...failed, breakEndsAt: 1_500_000 }))).toEqual(failed);
  }
  expect(parseSaved(JSON.stringify({ ...valid, breakEndsAt: 1_500_000 }))).toEqual(valid);
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

test("parseSaved keeps a tend's stage and drops a stage that is out of range or on a new plant", () => {
  const tend = { ...valid, plant: { species: "TREE" as const, x: 1, y: 0, tendId: "t1", stage: 2 } };
  expect(parseSaved(JSON.stringify(tend))).toEqual(tend);
  const { stage: _s, ...noStage } = tend.plant;
  void _s;
  expect(parseSaved(JSON.stringify({ ...tend, plant: { ...tend.plant, stage: 9 } }))).toEqual({ ...valid, plant: noStage });
  expect(parseSaved(JSON.stringify({ ...tend, plant: { ...tend.plant, stage: "2" } }))).toEqual({ ...valid, plant: noStage });
  const fern = { species: "FERN" as const, x: 0, y: 0 };
  expect(parseSaved(JSON.stringify({ ...valid, plant: { ...fern, stage: 2 } }))).toEqual({ ...valid, plant: fern });
});
test("parseSaved reads plantDropped when valid and leaves it out otherwise", () => {
  expect(parseSaved(JSON.stringify({ ...valid, plantDropped: "SEEDS" }))).toEqual({ ...valid, plantDropped: "SEEDS" });
  expect(parseSaved(JSON.stringify({ ...valid, plantDropped: "TEND" }))).toEqual({ ...valid, plantDropped: "TEND" });
  expect(parseSaved(JSON.stringify({ ...valid, plantDropped: "ERROR" }))).toEqual({ ...valid, plantDropped: "ERROR" });
  expect(parseSaved(JSON.stringify({ ...valid, plantDropped: "NOPE" }))).toEqual(valid);
  expect(parseSaved(JSON.stringify({ ...valid, plantDropped: null }))).toEqual(valid);
  expect("plantDropped" in parseSaved(JSON.stringify(valid))!).toBe(false);
});

const bush = { species: "BERRY_BUSH" as const, x: 0, y: 0 };
const tendTree = { species: "TREE" as const, x: 1, y: 1, tendId: "t1", stage: 2 };
test("droppedReason: nothing is dropped when the plant was accepted or there was none", () => {
  expect(droppedReason(bush, { plantAccepted: true })).toBeNull();
  expect(droppedReason(null, { plantAccepted: false })).toBeNull();
  expect(droppedReason(bush, {})).toBeNull();
});
test("droppedReason: a turned-down plant says why", () => {
  expect(droppedReason(bush, { plantAccepted: false })).toBe("SEEDS");
  expect(droppedReason(tendTree, { plantAccepted: false })).toBe("TEND");
  expect(droppedReason(bush, { plantAccepted: false, dropReason: "ERROR" })).toBe("ERROR");
  expect(droppedReason(tendTree, { plantAccepted: false, dropReason: "ERROR" })).toBe("ERROR");
  expect(droppedReason(bush, { plantAccepted: false, dropReason: "WHO" })).toBe("SEEDS");
});
