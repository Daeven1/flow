import { test, expect, vi } from "vitest";
import * as THREE from "three";
import { SPECIES } from "./layout";
import { buildPlant, fullHeight, spotToWorld, type PlantModel } from "./models";

const height = (m: PlantModel) => new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()).y;
test.each(SPECIES)("%s grows from a small sprout to its full height", (sp) => {
  const m = buildPlant(sp, 7, "light");
  m.setGrowth(0); const h0 = height(m);
  m.setGrowth(0.5); const h5 = height(m);
  m.setGrowth(1); const h1 = height(m);
  expect(h0).toBeGreaterThan(0.3 * fullHeight(sp));
  expect(h0).toBeLessThan(0.45 * fullHeight(sp));
  expect(h5).toBeGreaterThan(h0);
  expect(h1).toBeGreaterThan(h5);
  expect(h1).toBeGreaterThan(0.8 * fullHeight(sp));
  expect(h1).toBeLessThan(1.2 * fullHeight(sp));
});
test.each(SPECIES)("%s is visible from the first second", (sp) => {
  for (const seed of [1, 7, 11, 42]) {
    const m = buildPlant(sp, seed, "light"); m.setGrowth(0);
    const size = new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(0.28);
  }
});
test.each(SPECIES)("%s never gets shorter as it grows", (sp) => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = buildPlant(sp, seed, "light"); let prev = 0;
    for (let k = 0; k <= 20; k++) {
      m.setGrowth(k / 20); const h = height(m);
      expect(h, `seed ${seed} growth ${k / 20}`).toBeGreaterThanOrEqual(prev - 0.002);
      prev = h;
    }
  }
});
// Recorded from the plants as they were before the sprout was added.
const GROWN_BOX = {
  WILDFLOWERS: { min: [-0.36138, -0.0066, -0.34713], max: [0.34525, 0.67358, 0.32133] },
  FERN: { min: [-0.33818, -0.00539, -0.30406], max: [0.37334, 0.60907, 0.34757] },
} as const;
test.each(SPECIES)("%s looks the same fully grown as before the sprout", (sp) => {
  const m = buildPlant(sp, 11, "light"); m.setGrowth(1);
  const box = new THREE.Box3().setFromObject(m.group);
  const want = new THREE.Box3(new THREE.Vector3(...GROWN_BOX[sp].min), new THREE.Vector3(...GROWN_BOX[sp].max));
  const size = want.getSize(new THREE.Vector3()).toArray();
  box.min.toArray().forEach((v, i) => expect(Math.abs(v - want.min.getComponent(i))).toBeLessThanOrEqual(0.01 * size[i]));
  box.max.toArray().forEach((v, i) => expect(Math.abs(v - want.max.getComponent(i))).toBeLessThanOrEqual(0.01 * size[i]));
});
test.each(SPECIES)("%s stays under its triangle budget", (sp) => {
  for (const seed of [1, 7, 11, 42, 99]) {
    let tris = 0;
    buildPlant(sp, seed, "light").group.traverse((o) => { const g = (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry;
      if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    expect(tris).toBeLessThan(400);
  }
});
test("a sprout lost in its first minutes withers too", () => {
  const m = buildPlant("WILDFLOWERS", 3, "light"); m.setGrowth(0.1); const up = height(m);
  m.setWithered(1); expect(height(m)).toBeLessThan(up);
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
