import { test, expect, vi } from "vitest";
import * as THREE from "three";
import { SPECIES } from "./layout";
import { buildPlant, fullHeight, spotToWorld, type PlantModel } from "./models";

const height = (m: PlantModel) => new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()).y;
test.each(SPECIES)("%s grows from almost nothing to its full height", (sp) => {
  const m = buildPlant(sp, 7, "light");
  m.setGrowth(0); const h0 = height(m);
  m.setGrowth(0.5); const h5 = height(m);
  m.setGrowth(1); const h1 = height(m);
  expect(h0).toBeLessThan(0.1 * fullHeight(sp));
  expect(h5).toBeGreaterThan(h0);
  expect(h1).toBeGreaterThan(h5);
  expect(h1).toBeGreaterThan(0.8 * fullHeight(sp));
  expect(h1).toBeLessThan(1.2 * fullHeight(sp));
});
test("the same seed makes the same plant, another seed a different one", () => {
  const count = (seed: number) => { let n = 0; const m = buildPlant("WILDFLOWERS", seed, "light"); m.setGrowth(1);
    m.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) n += (o as THREE.Mesh).geometry.attributes.position.count; }); return n; };
  expect(count(3)).toBe(count(3));
  const shape = (seed: number) => { const m = buildPlant("WILDFLOWERS", seed, "light"); m.setGrowth(1); return new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()).toArray().join(","); };
  expect(shape(3)).not.toBe(shape(4));
});
test("every material is flat shaded", () => {
  for (const sp of SPECIES) buildPlant(sp, 1, "dark").group.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat) expect(mat.flatShading).toBe(true);
  });
});
test("withering lowers the plant", () => {
  const m = buildPlant("FERN", 2, "light"); m.setGrowth(1); const up = height(m);
  m.setWithered(1); expect(height(m)).toBeLessThan(up);
});
test("spots map to a centred unit grid", () => {
  expect(spotToWorld({ x: -1, y: -1 }).toArray()).toEqual([-0.5, 0, -0.5]);
  expect(spotToWorld({ x: 2, y: 0 }).toArray()).toEqual([2.5, 0, 0.5]);
});
test("dispose frees what the plant made", () => {
  const m = buildPlant("FERN", 5, "light"); const spies: ReturnType<typeof vi.spyOn>[] = [];
  m.group.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) spies.push(vi.spyOn(g, "dispose")); });
  m.dispose(); expect(spies.length).toBeGreaterThan(0); spies.forEach((s) => expect(s).toHaveBeenCalled());
});
