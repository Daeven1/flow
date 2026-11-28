import { expect, test } from "vitest";
import * as THREE from "three";
import { droppedReason } from "../focus/storage";
import { seedHeight } from "./chicorySowing";
import { buildPlant } from "./models";

test("only an explicit chicory receipt can confirm a chicory choice", () => {
  const plant = { species: "CHICORY", x: 0, y: 1 } as const;
  expect(droppedReason(plant, {})).toBe("UNAVAILABLE");
  expect(droppedReason(plant, { plantAccepted: true })).toBe("UNAVAILABLE");
  expect(droppedReason(plant, { plantAccepted: true, acceptedSpecies: "CHICORY" })).toBeNull();
  expect(droppedReason(plant, { plantAccepted: false, dropReason: "ERROR" })).toBe("ERROR");
});

test("seed rests then sinks, remaining buried on resume and after sowing", () => {
  expect(seedHeight(0)).toBe(seedHeight(1100));
  expect(seedHeight(1500)!).toBeGreaterThan(seedHeight(2500)!);
  expect(seedHeight(2900)!).toBeLessThan(0);
  for (const elapsed of [NaN, Infinity, -1, 3000, 60000]) expect(seedHeight(elapsed)).toBeNull();
  const model = buildPlant("CHICORY", 7, "light");
  model.setGrowth(0);
  expect(model.group.getObjectByName("Chicory achene")).toBeUndefined();
  model.setSowing?.(100);
  const seed = model.group.getObjectByName("Chicory achene")!;
  expect(seed.visible).toBe(true);
  const size = new THREE.Box3().setFromObject(seed).getSize(new THREE.Vector3());
  expect(Math.max(size.x, size.z)).toBeLessThan(0.25);
  expect(size.y).toBeLessThan(0.16);
  model.setSowing?.(Infinity);
  expect(seed.visible).toBe(false);
  model.setGrowth(1 / 16);
  model.setSowing?.(100);
  expect(seed.visible).toBe(false);
  const sprout = new THREE.Box3().setFromObject(model.group.children[0]).max.y;
  expect(sprout).toBeGreaterThan(0.075);
  expect(sprout).toBeLessThan(0.15);
  model.dispose();
});
