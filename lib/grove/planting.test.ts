import { expect, test } from "vitest";
import { planFor, resolvePlant } from "./planting";
import { spots } from "./layout";
import type { GrovePlant } from "./layout";

const S = { id: "s1", plantSpecies: "FERN", plantX: 0, plantY: 0, tendPlantId: null };
const END = new Date("2026-11-20T03:00:00.000Z");
test("a finished session keeps its plant", () => {
  expect(planFor(S, "COMPLETED", END, [])).toEqual(
    { sessionId: "s1", species: "FERN", x: 0, y: 0, status: "ALIVE", plantedAt: END, witheredAt: null });
  expect(planFor(S, "CLEARED", END, [])?.status).toBe("ALIVE");
});
test("a lost session leaves a withered plant", () => {
  expect(planFor(S, "LEFT", END, [])).toMatchObject({ status: "WITHERED", witheredAt: END });
  expect(planFor(S, "GAVE_UP", END, [])?.status).toBe("WITHERED");
});
test("a taken spot moves to the nearest free one", () => {
  expect(planFor(S, "COMPLETED", END, [{ x: 0, y: 0 }])).toMatchObject({ x: 0, y: -1 });
});
test("a full grid widens instead of failing", () => {
  const p = planFor(S, "COMPLETED", END, spots(6));
  expect(p).not.toBeNull();
  expect(spots(6).some((s) => s.x === p!.x && s.y === p!.y)).toBe(false);
});
test("a session without a plant makes none", () => {
  expect(planFor({ id: "s2", plantSpecies: null, plantX: null, plantY: null, tendPlantId: null }, "COMPLETED", END, [])).toBeNull();
  expect(planFor({ ...S, plantSpecies: "OAK" }, "COMPLETED", END, [])).toBeNull();
});
test("a tend session never makes a new plant", () => {
  const tend = { id: "s3", plantSpecies: "TREE", plantX: 1, plantY: 1, tendPlantId: "p1" };
  for (const o of ["COMPLETED", "CLEARED", "GAVE_UP", "LEFT"] as const) {
    expect(planFor(tend, o, END, [])).toBeNull();
  }
});
test("a berry bush plants exactly as wildflowers do", () => {
  const wf = planFor({ ...S, plantSpecies: "WILDFLOWERS" }, "COMPLETED", END, [{ x: 0, y: 0 }]);
  const bb = planFor({ ...S, plantSpecies: "BERRY_BUSH" }, "COMPLETED", END, [{ x: 0, y: 0 }]);
  expect(bb).toEqual({ ...wf, species: "BERRY_BUSH" });
  expect(planFor({ ...S, plantSpecies: "BERRY_BUSH" }, "LEFT", END, [])).toMatchObject({ species: "BERRY_BUSH", status: "WITHERED" });
});

const NONE = { plantSpecies: null, plantX: null, plantY: null, plantCost: 0, tendPlantId: null };
const SAPLING: GrovePlant = {
  id: "t1", species: "TREE", x: 4, y: -3, status: "ALIVE",
  plantedAt: "2026-11-20T03:00:00.000Z", witheredAt: null, stage: 1,
};
test("resolvePlant: no choice stores no plant and is accepted", () => {
  expect(resolvePlant(null, null, null)).toEqual({ ...NONE, accepted: true });
});
test("resolvePlant: a free plant needs no balance", () => {
  expect(resolvePlant({ species: "FERN", x: 1, y: 2 }, null, null)).toEqual(
    { plantSpecies: "FERN", plantX: 1, plantY: 2, plantCost: 0, tendPlantId: null, accepted: true });
});
test("resolvePlant: a paid plant with enough seeds is bought", () => {
  expect(resolvePlant({ species: "TREE", x: 0, y: 0 }, null, 3)).toEqual(
    { plantSpecies: "TREE", plantX: 0, plantY: 0, plantCost: 3, tendPlantId: null, accepted: true });
  expect(resolvePlant({ species: "BERRY_BUSH", x: 0, y: 0 }, null, 5)?.plantCost).toBe(2);
});
test("resolvePlant: a paid plant without enough seeds is dropped", () => {
  expect(resolvePlant({ species: "TREE", x: 0, y: 0 }, null, 2)).toEqual({ ...NONE, accepted: false });
  expect(resolvePlant({ species: "BERRY_BUSH", x: 0, y: 0 }, null, null)).toEqual({ ...NONE, accepted: false });
});
test("resolvePlant: tending a living sapling uses the tree's own spot and costs nothing", () => {
  expect(resolvePlant({ species: "TREE", x: 9, y: 9, tendId: "t1" }, SAPLING, 0)).toEqual(
    { plantSpecies: "TREE", plantX: 4, plantY: -3, plantCost: 0, tendPlantId: "t1", accepted: true });
  expect(resolvePlant({ species: "TREE", x: 0, y: 0, tendId: "t1" }, { ...SAPLING, stage: 2 }, null).accepted).toBe(true);
});
test.each([
  ["withered", { ...SAPLING, status: "WITHERED" as const }],
  ["mature", { ...SAPLING, stage: 3 }],
  ["not a tree", { ...SAPLING, species: "BERRY_BUSH" as const }],
  ["a different plant", { ...SAPLING, id: "t2" }],
  ["missing", null],
])("resolvePlant: a tend of a %s tree is dropped", (_name, tree) => {
  expect(resolvePlant({ species: "TREE", x: 0, y: 0, tendId: "t1" }, tree, 10)).toEqual({ ...NONE, accepted: false });
});
