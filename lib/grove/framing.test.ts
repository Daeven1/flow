import { expect, test } from "vitest";
import * as THREE from "three";
import { SPECIES, isTree } from "./layout";
import { BOUNCE_SCALE, SWAY_TILT, growingFrame, plantBounds } from "./framing";
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


test("the growing plant fits the phone close-up and the wider desktop landscape", () => {
  for (const [width, height] of [[288, 170], [365, 310], [360, 205], [1060, 630], [1400, 825]]) {
    for (const species of SPECIES) {
      const stage = isTree(species) ? 3 : 1;
      const frame = growingFrame({ species, stage }, width, height);
      const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 400);
      camera.position.set(0, frame.centerY + Math.sin(frame.elevation) * frame.distance,
        Math.cos(frame.elevation) * frame.distance);
      camera.lookAt(0, frame.centerY, 0);
      camera.updateMatrixWorld();
      expect(frame.singlePlant).toBe(width < 680);
      const h = fullHeight(species, stage) * 1.06;
      const cube = new THREE.Box3(
        new THREE.Vector3(-frame.reach, 0, -frame.reach),
        new THREE.Vector3(frame.reach, h, frame.reach),
      );
      for (const y of [cube.min.y, cube.max.y]) {
        for (const x of [cube.min.x, cube.max.x]) {
          for (const z of [cube.min.z, cube.max.z]) {
            const ndc = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(ndc.x)).toBeLessThan(1);
            expect(Math.abs(ndc.y)).toBeLessThan(1);
          }
        }
      }
      const base = new THREE.Vector3().project(camera);
      const crown = new THREE.Vector3(0, h, 0).project(camera);
      expect((crown.y - base.y) / 2).toBeGreaterThan(frame.singlePlant ? .29 : .23);
    }
  }
});
