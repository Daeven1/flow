import * as THREE from "three";
import { expect, test } from "vitest";
import { growthFrame, GROWTH_STEPS } from "./growth";
import { buildPlant, fullHeight, plantReach, type PlantModel } from "./models";

const names = ["CHICORY", "FIREWEED", "CANADA_COLUMBINE", "BLUE_FLAG_IRIS",
  "OSTRICH_FERN", "MAIDENHAIR_FERN", "PAPER_BIRCH", "WHITE_SPRUCE"] as const;
const trees = ["PAPER_BIRCH", "WHITE_SPRUCE"] as const;
const geometry = (model: PlantModel) => (model.group.children[0] as THREE.Mesh).geometry;

// Remove translation and independent X/Y/Z scaling before comparing. A drawing
// that simply grew in size or changed colour would still have the same signature.
function silhouette(model: PlantModel) {
  const geo = geometry(model);
  geo.computeBoundingBox();
  const bounds = geo.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  const positions = geo.getAttribute("position");
  const samples: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    samples.push(Math.round(32 * (positions.getX(i) - bounds.min.x) / (size.x || 1)),
      Math.round(32 * (positions.getY(i) - bounds.min.y) / (size.y || 1)),
      Math.round(32 * (positions.getZ(i) - bounds.min.z) / (size.z || 1)));
  }
  return samples.join(",");
}

test("growth uses the session clock and requires no separate mutable timer", () => {
  expect([NaN, -1, 0, 0.49, 0.50, 1, 1.1].map(growthFrame)).toEqual([0, 0, 0, 7, 8, 16, 16]);
});

test.each(names)("%s changes shape at all 17 ages and stays inside camera and draw budgets", (species) => {
  const model = buildPlant(species, 41, "light");
  expect(model.group.children).toHaveLength(1);
  const distinct = new Set<string>();
  for (let i = 0; i <= GROWTH_STEPS; i++) {
    model.setGrowth(i / GROWTH_STEPS);
    const mesh = geometry(model);
    const vertices = mesh.getAttribute("position");
    expect(vertices.count / 3).toBeLessThan(400);
    for (let j = 0; j < vertices.count; j++) {
      if (Math.hypot(vertices.getX(j), vertices.getZ(j)) > plantReach(species) + 0.00001 ||
          vertices.getY(j) > fullHeight(species) + 0.00001) throw new Error("Plant exceeds its camera frame");
    }
    distinct.add(silhouette(model));
  }
  expect(distinct.size).toBe(17);
  model.dispose();
});

test("new species have distinct mature geometry and reproduce exactly after a reload", () => {
  const finished = new Set<string>();
  for (const name of names) {
    const first = buildPlant(name, 903, "light");
    const restored = buildPlant(name, 903, "dark");
    finished.add(silhouette(first));
    first.setGrowth(0.62);
    restored.setGrowth(0.62);
    expect(geometry(restored).getAttribute("position").array).toEqual(geometry(first).getAttribute("position").array);
    first.dispose(); restored.dispose();
  }
  expect(finished.size).toBe(names.length);
});

test.each(trees)("%s tending starts at the exact prior tree and continues developing its crown", (species) => {
  for (const stage of [2, 3]) {
    const earlier = buildPlant(species, 27, "light", stage - 1);
    const next = buildPlant(species, 27, "light", stage);
    next.setGrowth(0);
    expect(geometry(next).getAttribute("position").array).toEqual(geometry(earlier).getAttribute("position").array);
    expect(geometry(next).getAttribute("color").array).toEqual(geometry(earlier).getAttribute("color").array);
    const poses = new Set<string>();
    for (let i = 0; i <= GROWTH_STEPS; i++) { next.setGrowth(i / GROWTH_STEPS); poses.add(silhouette(next)); }
    expect(poses.size).toBe(17);
    earlier.dispose(); next.dispose();
  }
});
