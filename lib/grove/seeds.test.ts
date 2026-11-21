import { expect, test } from "vitest";
import { balance, costOf, seedDelta } from "./seeds";

test("only a real flip changes seeds", () => {
  expect(seedDelta(false, true)).toBe(1);
  expect(seedDelta(true, false)).toBe(-1);
  expect(seedDelta(true, true)).toBe(0);
  expect(seedDelta(false, false)).toBe(0);
});
test("tick, untick, tick nets one seed", () => {
  expect(seedDelta(false, true) + seedDelta(true, false) + seedDelta(false, true)).toBe(1);
});
test("balance never goes below zero", () => {
  expect(balance(5, 3)).toBe(2);
  expect(balance(2, 5)).toBe(0);
});
test("costs", () => {
  expect(costOf(null)).toBe(0);
  expect(costOf({ species: "FERN", x: 0, y: 0 })).toBe(0);
  expect(costOf({ species: "BERRY_BUSH", x: 0, y: 0 })).toBe(2);
  expect(costOf({ species: "TREE", x: 0, y: 0 })).toBe(3);
  expect(costOf({ species: "TREE", x: 1, y: 1, tendId: "p1" })).toBe(0);
});
