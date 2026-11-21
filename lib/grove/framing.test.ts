import { expect, test } from "vitest";
import { BOUNCE_SCALE, SWAY_TILT, plantBounds } from "./framing";
import { MAX_CROWN_REACH, MAX_PLANT_HEIGHT, fullHeight, plantReach } from "./models";

const top = (h: number) => h * 1.06 * (1 + BOUNCE_SCALE) + 0.03;
const reach = (r: number, h: number) => r * (1 + BOUNCE_SCALE) + top(h) * Math.sin(SWAY_TILT);

test("a grove with a mature tree frames for the tallest, widest tree, as before", () => {
  const b = plantBounds([{ species: "FERN", stage: 1 }, { species: "TREE", stage: 3 }]);
  expect(b.top).toBeCloseTo(top(MAX_PLANT_HEIGHT), 10);
  expect(b.reach).toBeCloseTo(reach(MAX_CROWN_REACH, MAX_PLANT_HEIGHT), 10);
});
test("a grove without a mature tree frames lower and closer", () => {
  const young = plantBounds([{ species: "TREE", stage: 2 }]);
  const mature = plantBounds([{ species: "TREE", stage: 3 }]);
  expect(young.top).toBeCloseTo(top(fullHeight("TREE", 2)), 10);
  expect(young.top).toBeLessThan(mature.top);
  expect(young.reach).toBeLessThan(mature.reach);
  expect(plantBounds([{ species: "WILDFLOWERS", stage: 1 }]).top).toBeLessThan(young.top);
});
test("height and reach come from whichever plants are tallest and widest", () => {
  const b = plantBounds([{ species: "WILDFLOWERS", stage: 1 }, { species: "TREE", stage: 2 }]);
  const h = fullHeight("TREE", 2);
  expect(b.top).toBeCloseTo(top(h), 10);
  expect(b.reach).toBeCloseTo(reach(Math.max(plantReach("WILDFLOWERS", 1), plantReach("TREE", 2)), h), 10);
});
test("an empty grove (or only the setup marker) frames for the smallest plant", () => {
  const b = plantBounds([]);
  expect(b.top).toBeCloseTo(top(fullHeight("BERRY_BUSH")), 10);
  expect(b.reach).toBeCloseTo(reach(plantReach("BERRY_BUSH", 1), fullHeight("BERRY_BUSH")), 10);
  // Never smaller than the empty grove, whatever is in it.
  for (const sp of ["WILDFLOWERS", "FERN", "BERRY_BUSH", "TREE"] as const) {
    const one = plantBounds([{ species: sp, stage: 1 }]);
    expect(one.top).toBeGreaterThanOrEqual(b.top);
    expect(one.reach).toBeGreaterThanOrEqual(b.reach);
  }
});
