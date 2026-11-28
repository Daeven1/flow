import { test, expect, vi } from "vitest";
import * as THREE from "three";
import { ANIMALS, type AnimalKind } from "./habitat";
import { ANIMAL_FPS, buildAnimal, type AnimalModel, type Home } from "./animals";

// Homes as the canvas will pass them: a flowering spot, a mature tree, a berry bush.
const FLOWER: Home = { x: 1.5, z: -0.5, groundY: 0.05, perchY: 0.62, radius: 0.35 };
const TREE: Home = { x: -0.5, z: 0.5, groundY: 0.04, perchY: 1.9, radius: 0.5 };
const BUSH: Home = { x: 0.5, z: 1.5, groundY: 0.03, perchY: 0.55, radius: 0.35 };
const CASES = [
  ["BUTTERFLY", FLOWER], ["BEE", FLOWER], ["BIRD", TREE], ["BIRD", BUSH], ["SQUIRREL", TREE],
] as const satisfies readonly (readonly [AnimalKind, Home])[];
const SEEDS = [1, 7, 42, 1234, 99991];
// The island grass, light and dark (PALETTE.grass in models.ts).
const GRASS = { light: 0x93c768, dark: 0x5a8f3c } as const;

const v = new THREE.Vector3();
function eachVertex(m: AnimalModel, fn: (p: THREE.Vector3) => void) {
  m.group.updateMatrixWorld(true);
  m.group.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  });
}
const worldPositions = (m: AnimalModel) => { const out: number[] = []; eachVertex(m, (p) => out.push(p.x, p.y, p.z)); return out; };
const minY = (m: AnimalModel) => { let y = Infinity; eachVertex(m, (p) => { y = Math.min(y, p.y); }); return y; };
const tris = (m: AnimalModel) => { let n = 0; m.group.traverse((o) => { const g = (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry;
  if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3; }); return n; };
const meshes = (m: AnimalModel) => { const out: THREE.Mesh[] = []; m.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
const mats = (m: AnimalModel) => meshes(m).map((x) => x.material as THREE.MeshStandardMaterial);
const centre = (m: AnimalModel) => { let x = 0, y = 0, z = 0, n = 0; eachVertex(m, (p) => { x += p.x; y += p.y; z += p.z; n++; }); return [x / n, y / n, z / n]; };

test("animals update at a modest frame rate", () => {
  expect(ANIMAL_FPS).toBe(20);
});

test.each(CASES)("%s stays under its triangle budget", (kind, home) => {
  for (const seed of SEEDS) expect(tris(buildAnimal(kind, seed, "light", home)), `seed ${seed}`).toBeLessThanOrEqual(120);
});

test.each(CASES)("%s: the same seed and time give the same pose, whatever came before", (kind, home) => {
  for (const seed of SEEDS) {
    const a = buildAnimal(kind, seed, "light", home);
    const b = buildAnimal(kind, seed, "dark", home);
    for (const t of [0, 1234, 25_000, 61_050, 20 * 60_000]) {
      b.update(t + 5_000); b.update(3); // a different history
      a.update(t); b.update(t);
      expect(worldPositions(b), `seed ${seed} t ${t}`).toEqual(worldPositions(a));
    }
  }
});

test.each(CASES)("%s: different seeds give different animals or paths", (kind, home) => {
  const sig = (seed: number) => { const m = buildAnimal(kind, seed, "light", home); m.update(17_000);
    return centre(m).map((c) => c.toFixed(4)).join(",") + mats(m).map((x) => x.color.getHexString()).join(""); };
  expect(new Set(SEEDS.map(sig)).size).toBeGreaterThan(3);
});

test.each(CASES)("%s stays inside its home and above the ground for two minutes", (kind, home) => {
  const reach = kind === "BIRD" ? home.radius + 0.6 : home.radius;
  for (const seed of SEEDS) {
    const m = buildAnimal(kind, seed, "light", home);
    let far = 0, low = Infinity, high = -Infinity, at = { far: 0, low: 0, high: 0 };
    for (let t = 0; t <= 120_000; t += 50) {
      m.update(t);
      eachVertex(m, (p) => {
        const d = Math.hypot(p.x - home.x, p.z - home.z);
        if (d > far) { far = d; at.far = t; }
        if (p.y < low) { low = p.y; at.low = t; }
        if (p.y > high) { high = p.y; at.high = t; }
      });
    }
    expect(far, `seed ${seed} at ${at.far} ms`).toBeLessThanOrEqual(reach);
    expect(low, `seed ${seed} at ${at.low} ms`).toBeGreaterThanOrEqual(home.groundY - 0.01);
    expect(high, `seed ${seed} at ${at.high} ms`).toBeLessThanOrEqual(home.perchY + 0.5);
    at = { far: 0, low: 0, high: 0 };
  }
});

test.each(CASES)("%s: update allocates nothing and swaps no objects", (kind, home) => {
  const m = buildAnimal(kind, 7, "light", home);
  const snapshot = () => {
    const refs: unknown[] = [];
    m.group.traverse((o) => {
      refs.push(o, o.position, o.rotation, o.quaternion, o.scale, o.matrix, o.children.length);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { const mat = mesh.material as THREE.MeshStandardMaterial;
        refs.push(mesh.geometry, mesh.geometry.attributes.position, mat, mat.color); }
    });
    return refs;
  };
  m.update(0); const before = snapshot();
  for (let t = 0; t < 60_000; t += 333) m.update(t);
  const after = snapshot();
  expect(after.length).toBe(before.length);
  after.forEach((r, i) => expect(r).toBe(before[i]));
});

test.each(CASES)("%s: dispose frees every geometry and material", (kind, home) => {
  const m = buildAnimal(kind, 5, "light", home);
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  const seen = new Set<unknown>();
  for (const mesh of meshes(m)) for (const x of [mesh.geometry, mesh.material as THREE.Material]) {
    if (!seen.has(x)) { seen.add(x); spies.push(vi.spyOn(x, "dispose")); }
  }
  m.dispose();
  expect(spies.length).toBeGreaterThan(2);
  spies.forEach((s) => expect(s).toHaveBeenCalled());
});

test.each(CASES)("%s: flat shaded, and every colour stands out from the grass in both themes", (kind, home) => {
  // Distance in sRGB (0-1 per channel), as the hex colours are picked.
  const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => c / 255);
  const dist = (a: number, b: number) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  for (const theme of ["light", "dark"] as const) {
    const grass = GRASS[theme];
    for (const seed of SEEDS) {
      for (const mat of mats(buildAnimal(kind, seed, theme, home))) {
        expect(mat.flatShading).toBe(true);
        if (mat.transparent) continue; // the bee's see-through wings
        expect(dist(mat.color.getHex(), grass), `${theme} seed ${seed} #${mat.color.getHexString()}`).toBeGreaterThanOrEqual(0.25);
      }
    }
  }
});

test.each(CASES)("%s: setTheme recolours to exactly the other theme's colours", (kind, home) => {
  for (const seed of SEEDS) {
    const m = buildAnimal(kind, seed, "light", home);
    m.setTheme("dark");
    expect(mats(m).map((x) => x.color.getHex())).toEqual(mats(buildAnimal(kind, seed, "dark", home)).map((x) => x.color.getHex()));
    m.setTheme("light");
    expect(mats(m).map((x) => x.color.getHex())).toEqual(mats(buildAnimal(kind, seed, "light", home)).map((x) => x.color.getHex()));
  }
});

test.each(CASES)("%s: update(0) is a resting pose, sitting where it lives", (kind, home) => {
  for (const seed of SEEDS) {
    const m = buildAnimal(kind, seed, "light", home); m.update(0);
    const rest = kind === "SQUIRREL" ? home.groundY : home.perchY;
    expect(Math.abs(minY(m) - rest), `seed ${seed}`).toBeLessThan(0.02);
  }
});

test("a butterfly flies loops, flaps about six times a second, and settles on the blooms", () => {
  for (const seed of SEEDS) {
    const m = buildAnimal("BUTTERFLY", seed, "light", FLOWER);
    let high = 0, settled = 0;
    for (let t = 0; t <= 60_000; t += 100) {
      m.update(t); const y = minY(m) - FLOWER.groundY;
      high = Math.max(high, y);
      if (Math.abs(minY(m) - FLOWER.perchY) < 0.02) settled++;
    }
    expect(high, `seed ${seed}`).toBeGreaterThan(0.3);
    expect(settled, `seed ${seed}`).toBeGreaterThan(20); // a few seconds' rest in a minute
    // Count flaps over a flying second by the wing's upward swings.
    const wing = m.group.getObjectByName("wingR")!;
    let flaps = 0, prev = 0, prevUp = false;
    const start = 8_000;
    for (let t = start; t <= start + 1000; t += 10) { m.update(t); const a = wing.rotation.z;
      const up = a > prev; if (up && !prevUp) flaps++; prevUp = up; prev = a; }
    expect(flaps, `seed ${seed}`).toBeGreaterThanOrEqual(5);
    expect(flaps, `seed ${seed}`).toBeLessThanOrEqual(8);
  }
});

test("a bee darts between blooms and buzzes its wings while flying", () => {
  for (const seed of SEEDS) {
    const m = buildAnimal("BEE", seed, "light", FLOWER);
    const places = new Set<string>(); const scales = new Set<number>();
    const wing = m.group.getObjectByName("wingR")!;
    for (let t = 0; t <= 30_000; t += 50) { m.update(t);
      if (Math.abs(minY(m) - FLOWER.perchY) < 0.06) { const [x, , z] = centre(m); places.add(`${x.toFixed(1)},${z.toFixed(1)}`); }
      scales.add(+wing.scale.x.toFixed(3)); }
    expect(places.size, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    expect(scales.size, `seed ${seed}`).toBeGreaterThan(5);
  }
});

test.each([TREE, BUSH])("a bird perches on the crown, then flies down beside the tree and back", (home) => {
  for (const seed of SEEDS) {
    const m = buildAnimal("BIRD", seed, "light", home);
    let ground = false, beside = false;
    for (let t = 0; t <= 45_000; t += 50) { m.update(t); const y = minY(m);
      if (y < home.groundY + 0.02) { ground = true; const [x, , z] = centre(m);
        if (Math.hypot(x - home.x, z - home.z) > home.radius * 0.6) beside = true; } }
    expect(ground, `seed ${seed}`).toBe(true);
    expect(beside, `seed ${seed}`).toBe(true);
    m.update(0); const [x, , z] = centre(m);
    expect(Math.hypot(x - home.x, z - home.z), `seed ${seed}`).toBeLessThanOrEqual(0.15 + 0.03);
    // Its head turns while perched.
    const head = m.group.getObjectByName("head")!; const turns = new Set<number>();
    for (let t = 0; t <= 3000; t += 100) { m.update(t); turns.add(+head.rotation.y.toFixed(2)); }
    expect(turns.size, `seed ${seed}`).toBeGreaterThan(3);
  }
});

test("a squirrel runs around its tree, sits up and flicks its tail", () => {
  for (const seed of SEEDS) {
    const m = buildAnimal("SQUIRREL", seed, "light", TREE);
    const tail = m.group.getObjectByName("tail")!;
    const angles = new Set<string>(); const flicks = new Set<number>();
    for (let t = 0; t <= 60_000; t += 100) { m.update(t); const [x, , z] = centre(m);
      angles.add(Math.atan2(z - TREE.z, x - TREE.x).toFixed(1)); flicks.add(+tail.rotation.x.toFixed(2)); }
    expect(angles.size, `seed ${seed}`).toBeGreaterThan(15);
    expect(flicks.size, `seed ${seed}`).toBeGreaterThan(5);
    m.update(0); const sitting = m.group.getObjectByName("body")!.rotation.x;
    expect(sitting, `seed ${seed}`).toBeLessThan(-0.4); // sat up, nose to the sky
  }
});

test("every kind can be built", () => {
  for (const kind of ANIMALS) expect(buildAnimal(kind, 3, "light", kind === "SQUIRREL" || kind === "BIRD" ? TREE : FLOWER).group).toBeInstanceOf(THREE.Group);
});
