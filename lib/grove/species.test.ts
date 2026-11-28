import { expect, test } from "vitest";
import { parseSaved } from "../focus/storage";
import { canTend, parsePlantChoice, type GrovePlant } from "./layout";
import { fallbackPlant, planFor, replayedStart, resolvePlant } from "./planting";
import { COST, SPECIES } from "./species";
import { parseGrove } from "./useGrove";

const startedAt = Date.parse("2026-10-01T13:00:00Z");
const endedAt = new Date(startedAt + 25 * 60000);
const active = {
  id: "fictional-session", startedAt, plannedMinutes: 25, rule: "GENTLE",
  taskIds: ["fictional-task"], ticks: [], hiddenAt: null, ended: null,
};

test.each(SPECIES)("%s keeps its identity from selection through reload and completed planting", (species) => {
  const choice = { species, x: -1, y: 2 };
  expect(parsePlantChoice(choice)).toEqual(choice);
  expect(parseSaved(JSON.stringify({ ...active, plant: choice }))).toEqual({ ...active, plant: choice });
  const start = resolvePlant(choice, null, COST[species]);
  expect(start).toMatchObject({ accepted: true, plantSpecies: species, plantCost: COST[species] });
  expect(replayedStart({ id: active.id, plantSpecies: start.plantSpecies }, choice).plantAccepted).toBe(true);
  const completed = planFor({ ...start, id: active.id }, "COMPLETED", endedAt, []);
  expect(completed).toMatchObject({ species, x: -1, y: 2, status: "ALIVE" });
  const savedRow = { ...completed, id: "fictional-plant", plantedAt: endedAt.toISOString() };
  expect(parseGrove({ plants: [savedRow] })?.[0]).toMatchObject({ species, stage: 1 });
});

test.each(["TREE", "PAPER_BIRCH", "WHITE_SPRUCE"] as const)("%s still costs three seeds and can be tended for free twice", (species) => {
  const sapling = { id: "fictional-tree", species, x: 0, y: 0, plantedAt: endedAt.toISOString(),
    witheredAt: null, status: "ALIVE", stage: 1 } satisfies GrovePlant;
  const choice = { species, x: 0, y: 0 };
  expect(resolvePlant(choice, null, 2).accepted).toBe(false);
  expect(resolvePlant(choice, null, 3).plantCost).toBe(3);
  for (const stage of [1, 2]) {
    const tree = { ...sapling, stage };
    const tend = { ...choice, tendId: tree.id };
    expect(parsePlantChoice(tend)).toEqual(tend);
    expect(canTend(tree)).toBe(true);
    expect(resolvePlant(tend, tree, 0)).toMatchObject({ accepted: true, plantSpecies: species, plantCost: 0 });
    const withStage = { ...active, plant: { ...tend, stage: stage + 1 } };
    expect(parseSaved(JSON.stringify(withStage))).toEqual(withStage);
    expect(parseSaved(JSON.stringify({ ...active, plant: tend }))?.plant).toEqual(tend);
  }
  expect(canTend({ ...sapling, stage: 3 })).toBe(false);
});

test("free named ferns and flowers keep their identity when seed lookup is unavailable", () => {
  for (const species of ["CHICORY", "FIREWEED", "CANADA_COLUMBINE", "BLUE_FLAG_IRIS", "OSTRICH_FERN", "MAIDENHAIR_FERN"] as const) {
    const choice = { species, x: 0, y: 0 };
    expect(fallbackPlant(choice)).toMatchObject({ accepted: true, plantSpecies: species, plantCost: 0 });
    expect(parsePlantChoice({ ...choice, tendId: "fictional-tree" })).toBeNull();
  }
});

test("a stale tend for a different species leaves the requested tree alone", () => {
  const tree: GrovePlant = { id: "fictional-tree", species: "PAPER_BIRCH", x: 0, y: 0, stage: 1,
    status: "ALIVE", plantedAt: endedAt.toISOString(), witheredAt: null };
  const stale = { species: "WHITE_SPRUCE", x: 0, y: 0, tendId: tree.id } as const;
  expect(resolvePlant(stale, tree, null)).toMatchObject({ accepted: false, plantSpecies: null, tendPlantId: null });
});
