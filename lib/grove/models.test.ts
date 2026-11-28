import { test, expect, vi } from "vitest";
import * as THREE from "three";
import { SPECIES } from "./layout";
import { BOUNCE_SCALE, plantBounds } from "./framing";
import { MAX_CROWN_REACH, MAX_PLANT_HEIGHT, YOUNG_TREE_REACH, buildPlant, fullHeight, plantReach, spotToWorld, type PlantModel } from "./models";

const height = (m: PlantModel) => new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()).y;
test.each(SPECIES)("%s grows from a small sprout to its full height", (sp) => {
  const m = buildPlant(sp, 7, "light");
  m.setGrowth(0); const h0 = height(m);
  m.setGrowth(0.5); const h5 = height(m);
  m.setGrowth(1); const h1 = height(m);
  if (sp === "CHICORY") {
    // Newly planted chicory rests under a shallow patch of soil.
    expect(h0).toBeGreaterThan(0);
    expect(h0).toBeLessThan(0.02);
  } else expect(h0).toBeGreaterThan(0.3 * fullHeight(sp));
  // The sprout is one size for all; the berry bush (0.55) is the shortest grown plant.
  expect(h0).toBeLessThan(0.5 * fullHeight(sp));
  expect(h5).toBeGreaterThan(h0);
  expect(h1).toBeGreaterThan(h5);
  expect(h1).toBeGreaterThan(0.8 * fullHeight(sp));
  expect(h1).toBeLessThan(1.2 * fullHeight(sp));
});
test.each(SPECIES)("%s is visible from the first second", (sp) => {
  for (const seed of [1, 7, 11, 42]) {
    const m = buildPlant(sp, seed, "light"); m.setGrowth(0);
    const size = new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(sp === "CHICORY" ? 0.19 : 0.28);
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
test.each(["WILDFLOWERS", "FERN"] as const)("%s looks the same fully grown as before the sprout", (sp) => {
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

// ---------------------------------------------------------------------------
// Berry bush and the three-stage tree.

const STAGED = [["BERRY_BUSH", 1], ["TREE", 1], ["TREE", 2], ["TREE", 3]] as const;
const tris = (m: PlantModel) => { let n = 0; m.group.traverse((o) => { const g = (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry;
  if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3; }); return n; };
test("heights for every species and stage", () => {
  expect(fullHeight("WILDFLOWERS")).toBe(0.7);
  expect(fullHeight("FERN")).toBe(0.6);
  expect(fullHeight("BERRY_BUSH")).toBe(0.55);
  expect([1, 2, 3].map((s) => fullHeight("TREE", s))).toEqual([0.8, 1.3, 1.9]);
  expect(fullHeight("TREE")).toBe(0.8);
  expect(MAX_PLANT_HEIGHT).toBe(1.9);
});
test.each(STAGED)("%s stage %i grows to its full height", (sp, st) => {
  for (const seed of [1, 7, 11, 42]) {
    const m = buildPlant(sp, seed, "light", st);
    m.setGrowth(0); const h0 = height(m);
    m.setGrowth(1); const h1 = height(m);
    expect(h1, `seed ${seed}`).toBeGreaterThan(h0);
    expect(h1, `seed ${seed}`).toBeGreaterThan(0.8 * fullHeight(sp, st));
    expect(h1, `seed ${seed}`).toBeLessThan(1.2 * fullHeight(sp, st));
  }
});
test.each([2, 3])("a tree at stage %i starts where the stage before ended", (st) => {
  for (let seed = 1; seed <= 10; seed++) {
    const before = buildPlant("TREE", seed, "light", st - 1); before.setGrowth(1);
    const after = buildPlant("TREE", seed, "light", st); after.setGrowth(0);
    expect(Math.abs(height(after) - height(before)), `seed ${seed}`).toBeLessThanOrEqual(0.1 * height(before));
  }
});
test.each(STAGED)("%s stage %i never gets shorter as it grows", (sp, st) => {
  for (let seed = 1; seed <= 10; seed++) {
    const m = buildPlant(sp, seed, "light", st); let prev = 0;
    for (let k = 0; k <= 40; k++) {
      m.setGrowth(k / 40); const h = height(m);
      expect(h, `seed ${seed} growth ${k / 40}`).toBeGreaterThanOrEqual(prev - 0.002);
      prev = h;
    }
  }
});
test.each(STAGED)("%s stage %i stays under its triangle budget", (sp, st) => {
  const budget = sp === "TREE" && st === 3 ? 700 : 400;
  for (const seed of [1, 7, 11, 42, 99]) expect(tris(buildPlant(sp, seed, "dark", st))).toBeLessThan(budget);
});
test("a mature tree has a broad canopy and a thicker trunk than a sapling", () => {
  const width = (st: number) => { const m = buildPlant("TREE", 5, "light", st); m.setGrowth(1);
    const s = new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()); return Math.max(s.x, s.z); };
  expect(width(3)).toBeGreaterThan(0.95);
  expect(width(3)).toBeLessThan(1.35);
  const trunk = (st: number) => { const m = buildPlant("TREE", 5, "light", st); m.setGrowth(1);
    return m.group.getObjectByName("trunk")!.scale.x; };
  expect(trunk(3)).toBeGreaterThan(2 * trunk(1));
});
test("berries are red and appear only late", () => {
  for (const theme of ["light", "dark"] as const) {
    const m = buildPlant("BERRY_BUSH", 4, theme);
    const berries: THREE.Mesh[] = [];
    m.group.traverse((o) => { if (o.name === "berry") berries.push(o as THREE.Mesh); });
    expect(berries.length).toBeGreaterThanOrEqual(6);
    expect(berries.length).toBeLessThanOrEqual(10);
    const c = (berries[0].material as THREE.MeshStandardMaterial).color.getHex();
    expect(c).toBe(theme === "light" ? 0xd23a3a : 0xe85050);
    m.setGrowth(0.69); expect(berries.filter((b) => b.visible)).toHaveLength(0);
    m.setGrowth(1); expect(berries.filter((b) => b.visible)).toHaveLength(berries.length);
  }
});
test("only a sapling withers", () => {
  const sap = buildPlant("TREE", 3, "light", 1); sap.setGrowth(1); const up = height(sap);
  sap.setWithered(1); expect(height(sap)).toBeLessThan(up);
  for (const st of [2, 3]) {
    const m = buildPlant("TREE", 3, "light", st); m.setGrowth(0.5);
    const before = new THREE.Box3().setFromObject(m.group);
    m.setWithered(1);
    expect(new THREE.Box3().setFromObject(m.group).equals(before)).toBe(true);
  }
  const bush = buildPlant("BERRY_BUSH", 3, "light"); bush.setGrowth(1); const b = height(bush);
  bush.setWithered(1); expect(height(bush)).toBeLessThan(b);
});
test.each(STAGED)("%s stage %i disposes what it made", (sp, st) => {
  const m = buildPlant(sp, 5, "light", st); const spies: ReturnType<typeof vi.spyOn>[] = [];
  m.group.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) spies.push(vi.spyOn(g, "dispose")); });
  m.dispose(); spies.forEach((s) => expect(s).toHaveBeenCalled());
});
// Recorded from the shapes as first built (seed 11), so later changes to the
// berry bush or tree show up as a diff here.
const STAGED_BOX = {
  "BERRY_BUSH 1": { min: [-0.35924, -0.00089, -0.36221], max: [0.37294, 0.54291, 0.37278] },
  // Re-recorded 2026-11-21 when the sapling got its crook and twigs and the
  // young tree its side branch and second lump.
  "TREE 1": { min: [-0.31112, -0.00145, -0.18546], max: [0.30382, 0.73574, 0.11297] },
  "TREE 2": { min: [-0.40904, -0.00285, -0.51053], max: [0.28938, 1.29212, 0.39974] },
  "TREE 3": { min: [-0.51982, -0.00477, -0.69225], max: [0.52605, 1.89721, 0.53981] },
} as const;
test.each(STAGED)("%s stage %i keeps its recorded grown shape", (sp, st) => {
  const m = buildPlant(sp, 11, "light", st); m.setGrowth(1);
  const box = new THREE.Box3().setFromObject(m.group);
  const rec = STAGED_BOX[`${sp} ${st}` as keyof typeof STAGED_BOX];
  const want = new THREE.Box3(new THREE.Vector3(...rec.min), new THREE.Vector3(...rec.max));
  const size = want.getSize(new THREE.Vector3()).toArray();
  box.min.toArray().forEach((v, i) => expect(Math.abs(v - want.min.getComponent(i))).toBeLessThanOrEqual(0.01 * size[i]));
  box.max.toArray().forEach((v, i) => expect(Math.abs(v - want.max.getComponent(i))).toBeLessThanOrEqual(0.01 * size[i]));
});

const sideways = (m: PlantModel) => {
  let far = 0; const v = new THREE.Vector3(); m.group.updateMatrixWorld(true);
  m.group.traverse((o) => { const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); far = Math.max(far, Math.hypot(v.x, v.z)); } });
  return far;
};
test("no tree reaches sideways past MAX_CROWN_REACH", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const m = buildPlant("TREE", seed, "light", 3); m.setGrowth(1);
    expect(sideways(m), `seed ${seed}`).toBeLessThanOrEqual(MAX_CROWN_REACH);
    for (const st of [1, 2]) {
      const y = buildPlant("TREE", seed, "light", st); y.setGrowth(1);
      expect(sideways(y), `seed ${seed} stage ${st}`).toBeLessThanOrEqual(MAX_CROWN_REACH);
    }
  }
  // A bound, not a guess: no looser than it needs to be for the framing.
  expect(MAX_CROWN_REACH).toBeLessThan(0.95);
});
// The framing's no-clip guarantee: whatever state a plant is drawn in
// (growing, grown, drooping, withered), it stays inside the height and reach
// the camera allows for its species and stage.
test.each([
  ["WILDFLOWERS", 1], ["FERN", 1], ["BERRY_BUSH", 1], ["TREE", 1], ["TREE", 2], ["TREE", 3],
] as const)("%s stage %i stays within its framing height and reach in every state", (sp, st) => {
  const box = new THREE.Box3();
  const { top } = plantBounds([{ species: sp, stage: st }]);
  for (let seed = 1; seed <= 40; seed++) {
    const m = buildPlant(sp, seed * 7919, "light", st);
    for (const w of [0, 0.5, 1]) {
      for (let g = 0; g <= 10; g++) {
        m.setGrowth(g / 10); m.setWithered(w);
        const at = `seed ${seed * 7919} growth ${g / 10} withered ${w}`;
        expect(sideways(m), at).toBeLessThanOrEqual(plantReach(sp, st));
        // Bounced, it still stays under the top the framing allows.
        expect(box.setFromObject(m.group).max.y * (1 + BOUNCE_SCALE), at).toBeLessThanOrEqual(top);
      }
    }
  }
});
test("young trees and saplings reach less far than a mature tree, from the same numbers", () => {
  expect(plantReach("TREE", 1)).toBe(YOUNG_TREE_REACH);
  expect(plantReach("TREE", 2)).toBe(YOUNG_TREE_REACH);
  expect(plantReach("TREE", 3)).toBe(MAX_CROWN_REACH);
  expect(YOUNG_TREE_REACH).toBeLessThan(MAX_CROWN_REACH - 0.1);
  for (const sp of ["WILDFLOWERS", "FERN", "BERRY_BUSH"] as const) expect(plantReach(sp, 1)).toBeLessThan(MAX_CROWN_REACH);
});
test("a sapling has three tufts at different heights, a young tree two lumps and a side branch", () => {
  const lumpYs = (st: number) => { const m = buildPlant("TREE", 9, "light", st); m.setGrowth(1);
    const ys: number[] = []; m.group.updateMatrixWorld(true);
    m.group.traverse((o) => { const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry.type === "IcosahedronGeometry" && mesh.scale.x > 0.02) ys.push(+mesh.getWorldPosition(new THREE.Vector3()).y.toFixed(3)); });
    return ys; };
  const sap = lumpYs(1);
  expect(sap).toHaveLength(3);
  expect(new Set(sap).size).toBe(3);
  // two canopy lumps plus the branch's leaf tuft
  expect(lumpYs(2)).toHaveLength(3);
});
