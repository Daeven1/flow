import { expect, test } from "vitest";
import { approach, shownGrowth } from "./tween";

test("approach halves the gap each half-life and snaps when close or after a long pause", () => {
  expect(approach(0, 1, 600, 600)).toBeCloseTo(0.5);
  expect(approach(0.5, 1, 600, 600)).toBeCloseTo(0.75);
  expect(approach(0.9995, 1, 16, 600)).toBe(1);
  expect(approach(0, 1, 2001, 600)).toBe(1);
  expect(approach(0.3, 0.3, 16, 600)).toBe(0.3);
});
test("what the growing plant shows", () => {
  expect(shownGrowth({ progress: 0.4, outcome: null })).toEqual({ growth: 0.4, withered: 0 });
  expect(shownGrowth({ progress: 0.4, outcome: "CLEARED" })).toEqual({ growth: 1, withered: 0 });
  expect(shownGrowth({ progress: 1, outcome: "COMPLETED" })).toEqual({ growth: 1, withered: 0 });
  expect(shownGrowth({ progress: 0.4, outcome: "LEFT" })).toEqual({ growth: 0.35, withered: 1 });
  expect(shownGrowth({ progress: 0.4, outcome: "GAVE_UP" })).toEqual({ growth: 0.35, withered: 1 });
  // a lost plant never grows while it withers: min(progress, 0.35)
  expect(shownGrowth({ progress: 0.2, outcome: "GAVE_UP" })).toEqual({ growth: 0.2, withered: 1 });
  expect(shownGrowth({ progress: 1, outcome: "LEFT" })).toEqual({ growth: 0.35, withered: 1 });
});
test("what a tend shows: the next stage grows with progress, a lost tend goes back to the old stage", () => {
  expect(shownGrowth({ progress: 0.4, outcome: null, tend: true })).toEqual({ growth: 0.4, withered: 0 });
  expect(shownGrowth({ progress: 0.4, outcome: "COMPLETED", tend: true })).toEqual({ growth: 1, withered: 0 });
  expect(shownGrowth({ progress: 0.4, outcome: "CLEARED", tend: true })).toEqual({ growth: 1, withered: 0 });
  // growth 0 of the next stage is the old stage at full size; nothing withers
  expect(shownGrowth({ progress: 0.8, outcome: "GAVE_UP", tend: true })).toEqual({ growth: 0, withered: 0 });
  expect(shownGrowth({ progress: 0.2, outcome: "LEFT", tend: true })).toEqual({ growth: 0, withered: 0 });
  // tend: false is a new plant
  expect(shownGrowth({ progress: 0.4, outcome: "GAVE_UP", tend: false })).toEqual({ growth: 0.35, withered: 1 });
});
