import { expect, test } from "vitest";
import {
  canTend,
  defaultSpot,
  gridSize,
  nearestFree,
  parsePlantChoice,
  spots,
  witherExpiry,
} from "./layout";

test("grid widens only when nearly full", () => {
  expect([0, 30, 31, 58, 59].map(gridSize)).toEqual([6, 6, 8, 8, 10]);
});
test("a wider grid keeps every spot of the narrower one", () => {
  const six = spots(6), eight = spots(8);
  expect(six).toHaveLength(36);
  expect(eight).toHaveLength(64);
  expect(six.every((s) => eight.some((e) => e.x === s.x && e.y === s.y))).toBe(true);
  expect(six).toContainEqual({ x: -3, y: -3 });
  expect(six).toContainEqual({ x: 2, y: 2 });
});
test("default spot is the free one nearest the middle, ties by y then x", () => {
  expect(defaultSpot(6, [])).toEqual({ x: -1, y: -1 });
  expect(defaultSpot(6, [{ x: -1, y: -1 }])).toEqual({ x: 0, y: -1 });
  expect(defaultSpot(6, spots(6))).toBeNull();
});
test("nearestFree keeps a free wish and moves a taken one", () => {
  expect(nearestFree(6, [], { x: 2, y: 2 })).toEqual({ x: 2, y: 2 });
  expect(nearestFree(6, [{ x: 2, y: 2 }], { x: 2, y: 2 })).toEqual({ x: 2, y: 1 });
  expect(nearestFree(6, [], { x: 9, y: 9 })).toEqual({ x: 2, y: 2 });
});
test("a withered plant lasts until the end of the next local day", () => {
  expect(witherExpiry(new Date("2026-11-19T02:00:00.000Z"), -480).toISOString()).toBe("2026-11-20T16:00:00.000Z");
  expect(witherExpiry(new Date("2026-11-19T17:00:00.000Z"), -480).toISOString()).toBe("2026-11-21T16:00:00.000Z");
  expect(witherExpiry(new Date("2026-11-19T02:00:00.000Z"), 0).toISOString()).toBe("2026-11-21T00:00:00.000Z");
});
test("plant choice parsing", () => {
  expect(parsePlantChoice({ species: "FERN", x: -3, y: 2 })).toEqual({ species: "FERN", x: -3, y: 2 });
  expect(parsePlantChoice({ species: "OAK", x: 0, y: 0 })).toBeNull();
  expect(parsePlantChoice({ species: "FERN", x: 0.5, y: 0 })).toBeNull();
  expect(parsePlantChoice({ species: "FERN", x: 20, y: 0 })).toBeNull();
  expect(parsePlantChoice(null)).toBeNull();
});

test("plant choice with a tend id", () => {
  expect(parsePlantChoice({ species: "TREE", x: 1, y: 2, tendId: "abc" })).toEqual({ species: "TREE", x: 1, y: 2, tendId: "abc" });
  expect(parsePlantChoice({ species: "FERN", x: 1, y: 2, tendId: "abc" })).toBeNull();
  expect(parsePlantChoice({ species: "TREE", x: 1, y: 2, tendId: "" })).toBeNull();
  expect(parsePlantChoice({ species: "BERRY_BUSH", x: 0, y: 0 })).toEqual({ species: "BERRY_BUSH", x: 0, y: 0 });
});
test("only a living, unfinished tree can be tended", () => {
  const t = { id: "t", species: "TREE", x: 0, y: 0, status: "ALIVE", plantedAt: "", witheredAt: null, stage: 2 } as const;
  expect(canTend(t)).toBe(true);
  expect(canTend({ ...t, stage: 3 })).toBe(false);
  expect(canTend({ ...t, status: "WITHERED" })).toBe(false);
  expect(canTend({ ...t, species: "FERN", stage: 1 })).toBe(false);
});
