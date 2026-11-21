/**
 * Low-poly focus-grove shapes, built in code with three.js.
 *
 * Everything here is plain geometry and materials (no renderer, no DOM), so it
 * runs in Vitest's node environment. Every material is flat shaded, there are
 * no textures and no model files, and all randomness comes from mulberry32 so
 * the same seed always gives the same plant.
 *
 * Low-poly here means chunky faceted solids: tapered prisms for stems, broad
 * creased blades for leaves, faceted heads for blooms. Budgets: a plant stays
 * under about 400 triangles, the island under about 1,500.
 */
import * as THREE from "three";
import type { Species, Spot } from "./layout";

export type Theme = "light" | "dark";
export type PlantModel = {
  group: THREE.Group;
  setGrowth(t: number): void; // 0 = just planted, 1 = full size; clamps
  setWithered(w: number): void; // 0 = healthy, 1 = fully withered; clamps
  dispose(): void; // disposes every geometry and material it created
};

/** Small, fast seeded random. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tree's stage (1 sapling, 2 young, 3 mature); anything else rounds into range. */
const treeStage = (s: number) => Math.min(3, Math.max(1, Math.round(Number.isFinite(s) ? s : 1)));
const TREE_HEIGHTS = [0.8, 1.3, 1.9] as const;

/** How tall a plant stands fully grown; `stage` only matters for TREE. */
export function fullHeight(species: Species, stage = 1): number {
  switch (species) {
    case "FERN": return 0.6;
    case "BERRY_BUSH": return 0.55;
    case "TREE": return TREE_HEIGHTS[treeStage(stage) - 1];
    default: return 0.7;
  }
}

/** The tallest any plant gets (a mature tree), for camera framing. */
export const MAX_PLANT_HEIGHT = Math.max(0.7, 0.6, 0.55, ...TREE_HEIGHTS);

/** Spots are 1 unit apart; {x:-0.5,y:-0.5} is the origin; grid y is world z. */
export function spotToWorld(spot: Spot): THREE.Vector3 {
  return new THREE.Vector3(spot.x + 0.5, 0, spot.y + 0.5);
}

// ---------------------------------------------------------------------------
// Palette

const PALETTE = {
  light: {
    stem: 0x4a7f2e,
    leaf: 0x4b8a34,
    fern: 0x3f8a3a,
    fernRachis: 0x44702b,
    blooms: [0xf2c230, 0xf08a6c, 0xb497d6], // buttercup, soft coral, lilac
    bloomCentre: 0xc98a2e,
    grass: 0x93c768,
    soil: 0x9a7149,
    soilDeep: 0x6f4f33,
    // Sprout greens: deeper and more saturated than the grass (0x93c768) so
    // the seed leaves stand out, with a pale fresh tip.
    sprout: 0x3f9a3a,
    sproutStem: 0x2f7d34,
    sproutTip: 0xb5e38a,
    // Berry bush and tree: deeper than the grass, like the sprout.
    bushLeaf: 0x3e8c40,
    bushLeafDeep: 0x33783a,
    berry: 0xd23a3a,
    bark: 0x8a5a36,
    canopy: 0x3a8a3c,
    canopyDeep: 0x2e7536,
  },
  dark: {
    // Deeper, more saturated greens; blooms kept bright against Midnight Navy.
    stem: 0x3f8a2a,
    leaf: 0x3e9a30,
    fern: 0x2f9a3c,
    fernRachis: 0x3c7a27,
    blooms: [0xffd23f, 0xff8e72, 0xc9a8ff],
    bloomCentre: 0xe8a33c,
    grass: 0x5a8f3c,
    soil: 0x7a5636,
    soilDeep: 0x4d3522,
    // Brighter than the dark grass (0x5a8f3c), like the dark adult leaves.
    sprout: 0x4fc04a,
    sproutStem: 0x2c7a30,
    sproutTip: 0x9fe07a,
    // Brighter and more saturated than the dark grass, like the sprout.
    bushLeaf: 0x47b04c,
    bushLeafDeep: 0x3a9842,
    berry: 0xe85050,
    bark: 0x9a6a44,
    canopy: 0x45ad48,
    canopyDeep: 0x35963f,
  },
} as const;

const STRAW = new THREE.Color(0xc4ad74);
const DRIED_BLOOM = new THREE.Color(0x9c7b52);
const DRIED_BERRY = new THREE.Color(0x6e3b2e);

// ---------------------------------------------------------------------------
// Helpers

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** 0 before a, 1 after b, smooth in between. */
const stage = (t: number, a: number, b: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
/** Never scale to exactly zero: a singular matrix upsets normal matrices. */
const tiny = (v: number) => Math.max(0.001, v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Tracker = {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
};

function track<G extends THREE.BufferGeometry>(tr: Tracker, g: G): G {
  tr.geometries.push(g);
  return g;
}

function material(tr: Tracker, color: number | THREE.Color, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts });
  tr.materials.push(m);
  return m;
}

function disposer(tr: Tracker) {
  return () => {
    for (const g of tr.geometries) g.dispose();
    for (const m of tr.materials) m.dispose();
    tr.geometries.length = 0;
    tr.materials.length = 0;
  };
}

/**
 * Tapered open prism of unit height and unit base radius, base at y = 0.
 * Scale x/z to the base radius and y to the length.
 */
function prismGeometry(tr: Tracker, sides: number, taper: number) {
  const g = new THREE.CylinderGeometry(taper, 1, 1, sides, 1, true);
  g.translate(0, 0.5, 0);
  return track(tr, g);
}

function fromTriangles(tr: Tracker, positions: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return track(tr, g);
}

/** Sets each material's colour between its healthy colour and a dried one. */
type ColourShift = { mat: THREE.MeshStandardMaterial; healthy: THREE.Color; dried: THREE.Color };
function applyColours(shifts: ColourShift[], w: number) {
  for (const s of shifts) s.mat.color.copy(s.healthy).lerp(s.dried, w);
}

/**
 * Scales `body` so the plant, fully grown and healthy, stands at `target`.
 * Leaves the plant in that state; the caller re-applies its real state.
 */
function fitHeight(group: THREE.Group, body: THREE.Group, target: number) {
  body.scale.setScalar(1);
  const h = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y;
  if (h > 0) body.scale.setScalar(target / h);
}

// ---------------------------------------------------------------------------
// Sprout: every plant starts as a short faceted stem with two seed leaves
// (cotyledons), so a session is visibly alive from its first second.
//
// It sits on the plant's outer group, outside the fitted body, so it is the
// same world size for every species: about 0.26 tall and 0.34 across the
// leaves at growth 0. The leaves sit about 12 degrees above horizontal, so
// their faces show to the camera looking down, and perk up to 30 (0-0.15). The sprout then waits until the species'
// own parts stand taller than it, and only then shrinks into the base, so
// the plant never gets shorter as it grows. When that happens is measured
// once per plant (`fitSprout`); it always starts at 0.3 or later and is over
// by 0.65, after which the sprout is hidden and the grown plant is exactly
// what it was. About 22 triangles.

const SPROUT_HEIGHT = 0.185; // stem; the raised leaves add the last few centimetres
const SPROUT_LEAF = 0.18; // each leaf's reach from the stem
const SPROUT_RADIUS = 0.022;
const SPROUT_SHRINK_FROM = 0.3; // earliest start of the handover
const SPROUT_GONE_BY = 0.65; // the adult look is untouched from here up
const SPROUT_SHRINK_SPAN = 0.1;

// A rounded seed leaf along +x, unit length, with a raised midrib. The last
// bit of the tip is a separate two-triangle piece in a paler green.
const COT = {
  base: [0, 0, 0], tip: [1, 0.06, 0], m: [0.5, 0.09, 0], n: [0.84, 0.07, 0],
  l1: [0.25, 0.02, -0.28], l2: [0.72, 0.05, -0.3],
  r1: [0.25, 0.02, 0.28], r2: [0.72, 0.05, 0.3],
};

function cotyledonGeometry(tr: Tracker) {
  const { base, m, n, l1, l2, r1, r2 } = COT;
  return fromTriangles(tr, [
    ...base, ...m, ...l1,
    ...l1, ...m, ...l2,
    ...l2, ...m, ...n,
    ...base, ...r1, ...m,
    ...r1, ...r2, ...m,
    ...r2, ...n, ...m,
  ]);
}

function cotyledonTipGeometry(tr: Tracker) {
  const { tip, n, l2, r2 } = COT;
  return fromTriangles(tr, [...l2, ...n, ...tip, ...r2, ...tip, ...n]);
}

type Sprout = {
  root: THREE.Group;
  apply(growth: number, w: number): void;
  /** Sets the growth range over which the sprout shrinks away. */
  setHandover(from: number, to: number): void;
};

function buildSprout(tr: Tracker, parent: THREE.Group, seed: number, pal: (typeof PALETTE)[Theme]): Sprout {
  // Its own random stream, so the species' draws (and shapes) are unchanged.
  const rand = mulberry32((seed ^ 0x51ed1e55) + 0x2f);
  const stemMat = material(tr, pal.sproutStem);
  const leafMat = material(tr, pal.sprout, { side: THREE.DoubleSide });
  const tipMat = material(tr, pal.sproutTip, { side: THREE.DoubleSide });
  const shifts: ColourShift[] = [
    { mat: stemMat, healthy: new THREE.Color(pal.sproutStem), dried: STRAW },
    { mat: leafMat, healthy: new THREE.Color(pal.sprout), dried: STRAW },
    { mat: tipMat, healthy: new THREE.Color(pal.sproutTip), dried: STRAW },
  ];

  const root = new THREE.Group();
  root.name = "sprout";
  root.rotation.order = "YXZ";
  root.rotation.y = rand() * Math.PI * 2;
  parent.add(root);
  const tilt = (rand() - 0.5) * 0.24; // a slight per-seed lean
  const stem = new THREE.Mesh(prismGeometry(tr, 5, 0.7), stemMat);
  root.add(stem);
  const top = new THREE.Group();
  root.add(top);
  const leafGeo = cotyledonGeometry(tr);
  const tipGeo = cotyledonTipGeometry(tr);
  const leaves = [0, Math.PI].map((side) => {
    const holder = new THREE.Group();
    holder.rotation.order = "YXZ";
    holder.rotation.y = side + (rand() - 0.5) * 0.3;
    const mesh = new THREE.Mesh(leafGeo, leafMat);
    mesh.add(new THREE.Mesh(tipGeo, tipMat)); // scales with the leaf
    holder.add(mesh);
    top.add(holder);
    return { holder, mesh, jitter: (rand() - 0.5) * 0.1, size: SPROUT_LEAF * (0.94 + rand() * 0.12) };
  });

  let shrinkFrom = SPROUT_GONE_BY - SPROUT_SHRINK_SPAN;
  let shrinkTo = SPROUT_GONE_BY;
  return {
    root,
    setHandover(from, to) { shrinkFrom = from; shrinkTo = to; },
    apply(growth, w) {
      const perk = stage(growth, 0, 0.15);
      const keep = 1 - stage(growth, shrinkFrom, shrinkTo);
      root.visible = keep > 0;
      // Withered sprouts lean over and their leaves hang.
      root.rotation.z = tilt - w * 0.45;
      const h = SPROUT_HEIGHT * keep * (1 - 0.15 * w);
      const r = SPROUT_RADIUS * (0.5 + 0.5 * keep);
      stem.scale.set(r, tiny(h), r);
      top.position.y = h;
      for (const l of leaves) {
        l.holder.rotation.z = lerp(0.22, 0.52, perk) + l.jitter - w * 0.9;
        l.mesh.scale.setScalar(tiny(l.size * keep * (1 - 0.15 * w)));
      }
      applyColours(shifts, w);
    },
  };
}

/**
 * Picks the sprout's handover for this plant: the first growth (from 0.3)
 * at which the species' own parts stand at least as tall as the perked-up
 * sprout. From then on the sprout only shrinks below the rest of the plant,
 * so overall height never drops. Runs once at build time, after the body is
 * fitted; it leaves the plant fully grown and healthy, like `fitHeight`.
 */
function fitSprout(body: THREE.Group, sprout: Sprout, apply: (g: number) => void) {
  const box = new THREE.Box3();
  apply(0.15);
  const sproutTop = box.setFromObject(sprout.root).max.y;
  // A late handover gets a shorter shrink so it still ends by SPROUT_GONE_BY.
  const latest = SPROUT_GONE_BY - 0.02;
  let from = latest;
  for (let g = SPROUT_SHRINK_FROM; g < latest; g += 0.01) {
    apply(g);
    if (box.setFromObject(body).max.y >= sproutTop) { from = g; break; }
  }
  sprout.setHandover(from, Math.min(SPROUT_GONE_BY, from + SPROUT_SHRINK_SPAN));
  apply(1);
}

// ---------------------------------------------------------------------------
// Wildflowers: a rosette of broad basal leaves with 3-5 stems rising out of
// it, each ending in a faceted five-petal head.
//
// Each stem is two tapered prisms joined at a knee so it can arch and droop.
// The sprout comes first (gone by 0.65 at the latest); basal leaves unfold
// (t 0.1-0.45), stems rise (0.15-0.65), stem leaves open (0.35-0.8), blooms
// open last (0.65-1).

function bloomGeometry(tr: Tracker) {
  // Five flattened petal wedges round a raised centre, over a shallow cone,
  // so the head is a solid faceted cup. Unit radius.
  const pts: number[] = [];
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tip = i % 2 === 0;
    const r = tip ? 1 : 0.5;
    rim.push(new THREE.Vector3(Math.cos(a) * r, tip ? 0.3 : 0.1, Math.sin(a) * r));
  }
  const top = new THREE.Vector3(0, 0.14, 0);
  const under = new THREE.Vector3(0, -0.32, 0);
  for (let i = 0; i < 10; i++) {
    const p = rim[i];
    const q = rim[(i + 1) % 10];
    pts.push(top.x, top.y, top.z, q.x, q.y, q.z, p.x, p.y, p.z);
    pts.push(under.x, under.y, under.z, p.x, p.y, p.z, q.x, q.y, q.z);
  }
  return fromTriangles(tr, pts);
}

function bladeGeometry(tr: Tracker) {
  // A broad leaf along +x, unit length, with a raised midrib so its two
  // halves catch the light differently.
  const base = [0, 0, 0], l = [0.42, 0.03, -0.3], tip = [1, 0.08, 0], r = [0.42, 0.03, 0.3], m = [0.46, 0.1, 0];
  return fromTriangles(tr, [
    ...base, ...m, ...l,
    ...l, ...m, ...tip,
    ...base, ...r, ...m,
    ...m, ...r, ...tip,
  ]);
}

function buildWildflowers(seed: number, theme: Theme): PlantModel {
  const rand = mulberry32(seed);
  const pal = PALETTE[theme];
  const tr: Tracker = { geometries: [], materials: [] };

  const group = new THREE.Group();
  group.name = "wildflowers";
  const body = new THREE.Group();
  group.add(body);
  const sprout = buildSprout(tr, group, seed, pal);

  // Shared within the plant.
  const stalkGeo = prismGeometry(tr, 5, 0.6);
  const bloomGeo = bloomGeometry(tr);
  const centreGeo = track(tr, new THREE.OctahedronGeometry(1, 0));
  const bladeGeo = bladeGeometry(tr);

  const stemMat = material(tr, pal.stem);
  const leafMat = material(tr, pal.leaf, { side: THREE.DoubleSide });
  const centreMat = material(tr, pal.bloomCentre);

  // Two or three bloom colours from the warm palette, cycled across stems so
  // every clump shows all of them.
  const order = [0, 1, 2];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const colourCount = rand() < 0.5 ? 2 : 3;
  const bloomMats = order
    .slice(0, colourCount)
    .map((k) => material(tr, pal.blooms[k], { side: THREE.DoubleSide }));

  const shifts: ColourShift[] = [
    { mat: stemMat, healthy: new THREE.Color(pal.stem), dried: STRAW },
    { mat: leafMat, healthy: new THREE.Color(pal.leaf), dried: STRAW },
    { mat: centreMat, healthy: new THREE.Color(pal.bloomCentre), dried: DRIED_BLOOM },
    ...bloomMats.map((m) => ({ mat: m, healthy: m.color.clone(), dried: DRIED_BLOOM })),
  ];

  // Basal rosette.
  type Leaf = { holder: THREE.Group; mesh: THREE.Mesh; size: number; lift: number };
  const basal: Leaf[] = [];
  const basalCount = 5 + Math.floor(rand() * 3); // 5-7
  for (let k = 0; k < basalCount; k++) {
    const holder = new THREE.Group();
    holder.rotation.order = "YXZ";
    holder.rotation.y = (k / basalCount) * Math.PI * 2 + rand() * 0.6;
    const mesh = new THREE.Mesh(bladeGeo, leafMat);
    holder.add(mesh);
    body.add(holder);
    basal.push({ holder, mesh, size: 0.29 + rand() * 0.08, lift: 0.25 + rand() * 0.25 });
  }

  type Stem = {
    pivot: THREE.Group; lean: number; yaw: number;
    lower: THREE.Mesh; lowerLen: number; radius: number;
    knee: THREE.Group; bend: number;
    upper: THREE.Mesh; upperLen: number;
    leaf: Leaf & { at: number };
    bloomHolder: THREE.Group; bloom: THREE.Group; bloomSize: number;
  };
  const stems: Stem[] = [];
  const count = 3 + Math.floor(rand() * 3); // 3-5
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * Math.PI * 2 + rand() * 0.8;
    const r = 0.02 + rand() * 0.05;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(yaw) * r, 0, Math.sin(yaw) * r);
    pivot.rotation.order = "YXZ";
    body.add(pivot);

    const len = 0.5 + rand() * 0.18;
    const lowerLen = len * (0.55 + rand() * 0.1);
    const upperLen = len - lowerLen;

    const lower = new THREE.Mesh(stalkGeo, stemMat);
    pivot.add(lower);

    const leafHolder = new THREE.Group();
    leafHolder.rotation.order = "YXZ";
    leafHolder.rotation.y = rand() * Math.PI * 2;
    const leafMesh = new THREE.Mesh(bladeGeo, leafMat);
    leafHolder.add(leafMesh);
    pivot.add(leafHolder);

    const knee = new THREE.Group();
    pivot.add(knee);
    const upper = new THREE.Mesh(stalkGeo, stemMat);
    knee.add(upper);

    const bloomHolder = new THREE.Group();
    knee.add(bloomHolder);
    const bloom = new THREE.Group();
    bloomHolder.add(bloom);
    const petals = new THREE.Mesh(bloomGeo, bloomMats[i % bloomMats.length]);
    const centre = new THREE.Mesh(centreGeo, centreMat);
    centre.scale.set(0.3, 0.22, 0.3);
    centre.position.y = 0.16;
    bloom.add(petals, centre);
    bloom.rotation.y = rand() * Math.PI;

    stems.push({
      pivot, yaw, lean: 0.15 + rand() * 0.25, radius: 0.017 + rand() * 0.002,
      lower, lowerLen, knee, bend: 0.05 + rand() * 0.18, upper, upperLen,
      leaf: { holder: leafHolder, mesh: leafMesh, size: 0.12 + rand() * 0.04, lift: 0.6 + rand() * 0.3, at: 0.35 + rand() * 0.3 },
      bloomHolder, bloom, bloomSize: 0.056 + rand() * 0.006,
    });
  }

  let growth = 1;
  let withered = 0;
  const apply = () => {
    const leafOpen = stage(growth, 0.1, 0.45);
    const rise = stage(growth, 0.15, 0.65);
    const unfold = stage(growth, 0.35, 0.8);
    const open = stage(growth, 0.65, 1);
    const w = withered;
    for (const l of basal) {
      // Young leaves stand up; grown ones spread; withered ones lie flat.
      l.holder.rotation.z = lerp(1.1, l.lift, leafOpen) - w * (l.lift + 0.15);
      l.mesh.scale.setScalar(tiny(l.size * leafOpen * (1 - 0.2 * w)));
    }
    for (const s of stems) {
      // Young stems stand straighter; withered ones lean and droop.
      s.pivot.rotation.set(0, s.yaw, -(s.lean * (0.5 + 0.5 * rise) + w * 0.55));
      const rad = s.radius * (0.45 + 0.55 * rise);
      s.lower.scale.set(rad, tiny(s.lowerLen * rise), rad);
      s.knee.position.y = s.lowerLen * rise;
      s.knee.rotation.z = -(s.bend * rise + w * 0.6);
      s.upper.scale.set(rad * 0.6, tiny(s.upperLen * rise), rad * 0.6);
      s.bloomHolder.position.y = s.upperLen * rise;
      // Heads turn back towards the sky; withered heads hang.
      s.bloomHolder.rotation.z = (s.lean + s.bend) * 0.7 * (1 - w) - w * 0.8;
      s.bloom.scale.setScalar(tiny(s.bloomSize * open * (1 - 0.4 * w)));
      s.leaf.holder.position.y = s.lowerLen * rise * s.leaf.at;
      s.leaf.holder.rotation.z = s.leaf.lift - w * 0.7;
      s.leaf.mesh.scale.setScalar(tiny(s.leaf.size * unfold * (1 - 0.25 * w)));
    }
    applyColours(shifts, w);
    sprout.apply(growth, w);
  };

  apply();
  fitHeight(group, body, fullHeight("WILDFLOWERS") * (0.92 + rand() * 0.14));
  fitSprout(body, sprout, (g) => { growth = g; apply(); });

  return {
    group,
    setGrowth(t) { growth = clamp01(t); apply(); },
    setWithered(v) { withered = clamp01(v); apply(); },
    dispose: disposer(tr),
  };
}

// ---------------------------------------------------------------------------
// Fern: a rosette of 6-7 arching fronds, each a tapered strip of broad
// creased leaflets on a three-sided rachis.
//
// Each frond is a chain of segments; each joint bends a little so the frond
// arches. While young the joints are curled tight like a fiddlehead and
// uncurl as the frond unfolds. After the sprout, fronds rise (0.1-0.5), leaflets unfold
// from the base outwards (0.3-0.8), and the tip opens last (0.7-1).

const FROND_SEGMENTS = 4;

function leafletGeometry(tr: Tracker) {
  // A broad leaflet: its base runs along the rachis (local y, 0..1) and it
  // reaches out along +z (0..1), sweeping towards the frond tip. A slight
  // crease in x makes its facets read. Unit size.
  const p0 = [0, 0, 0], p1 = [0.12, 0.22, 0.62], p2 = [0.18, 0.85, 1], p3 = [0.1, 1.08, 0.5], p4 = [0, 1, 0];
  return fromTriangles(tr, [
    ...p0, ...p1, ...p2,
    ...p0, ...p2, ...p4,
    ...p2, ...p3, ...p4,
  ]);
}

function buildFern(seed: number, theme: Theme): PlantModel {
  const rand = mulberry32(seed);
  const pal = PALETTE[theme];
  const tr: Tracker = { geometries: [], materials: [] };

  const group = new THREE.Group();
  group.name = "fern";
  const body = new THREE.Group();
  group.add(body);
  const sprout = buildSprout(tr, group, seed, pal);

  const rachisGeo = prismGeometry(tr, 3, 0.55);
  const leafletGeo = leafletGeometry(tr);
  const rachisMat = material(tr, pal.fernRachis);
  const leafMat = material(tr, pal.fern, { side: THREE.DoubleSide });
  const shifts: ColourShift[] = [
    { mat: rachisMat, healthy: new THREE.Color(pal.fernRachis), dried: STRAW },
    { mat: leafMat, healthy: new THREE.Color(pal.fern), dried: STRAW },
  ];

  type Segment = { joint: THREE.Group; rachis: THREE.Mesh; leaflets: THREE.Mesh[]; size: number };
  type Frond = {
    tilt: THREE.Group; pitch: number; arch: number; segLen: number;
    segments: Segment[]; tip: THREE.Mesh; tipSize: number;
  };
  const fronds: Frond[] = [];
  const count = 6 + Math.floor(rand() * 2); // 6-7
  for (let i = 0; i < count; i++) {
    const yawGroup = new THREE.Group();
    yawGroup.rotation.y = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    body.add(yawGroup);
    const tilt = new THREE.Group(); // leans the frond outwards (+x)
    yawGroup.add(tilt);

    const length = 0.52 + rand() * 0.12;
    const segLen = length / FROND_SEGMENTS;
    const leafletLen = 0.1 + rand() * 0.025;

    const segments: Segment[] = [];
    let parent: THREE.Group = tilt;
    for (let j = 0; j < FROND_SEGMENTS; j++) {
      const joint = new THREE.Group();
      parent.add(joint);
      const rachis = new THREE.Mesh(rachisGeo, rachisMat);
      joint.add(rachis);
      const leaflets: THREE.Mesh[] = [];
      // Local -x faces the sky once the frond leans out, so turning each
      // leaflet a little towards -x lifts its outer edge into a shallow V.
      for (const side of [-0.35, Math.PI + 0.35]) {
        const leaflet = new THREE.Mesh(leafletGeo, leafMat);
        leaflet.rotation.order = "YXZ";
        leaflet.rotation.y = side;
        joint.add(leaflet);
        leaflets.push(leaflet);
      }
      // Leaflets are widest just below the middle and taper to the tip.
      const taper = [0.85, 1, 0.82, 0.55][j];
      segments.push({ joint, rachis, leaflets, size: leafletLen * taper });
      parent = joint;
    }
    const tip = new THREE.Mesh(leafletGeo, leafMat);
    // The tip leaflet points straight along the frond (+z turned to +y).
    tip.rotation.x = -Math.PI / 2;
    parent.add(tip);

    fronds.push({
      tilt, pitch: 0.2 + rand() * 0.16, arch: 0.12 + rand() * 0.06, segLen,
      segments, tip, tipSize: leafletLen * 0.5,
    });
  }

  let growth = 1;
  let withered = 0;
  const apply = () => {
    const rise = stage(growth, 0.1, 0.5);
    const tipOpen = stage(growth, 0.7, 1);
    const w = withered;
    const rad = 0.014 * (0.5 + 0.5 * rise);
    for (const f of fronds) {
      // Young fronds stand nearly upright; withered ones sag outwards.
      f.tilt.rotation.z = -(f.pitch * (0.3 + 0.7 * rise) + w * 0.45);
      let prevLen = 0;
      f.segments.forEach((s, j) => {
        // Base leaflets unfold first, the outer ones later.
        const unfold = stage(growth, 0.3 + j * 0.08, 0.55 + j * 0.08);
        // While curled the outer segments are short, so the coil stays a
        // tight fiddlehead on top of the stalk rather than reaching the ground.
        const len = f.segLen * rise * (j === 0 ? 1 : lerp(0.45, 1, unfold));
        s.joint.position.y = prevLen;
        const curl = j === 0 ? 0 : (1 - unfold) * 0.9;
        s.joint.rotation.z = -(j === 0 ? 0 : f.arch + curl + w * 0.25);
        s.rachis.scale.set(rad, tiny(len), rad);
        const out = tiny(s.size * unfold * (1 - 0.3 * w));
        for (const l of s.leaflets) {
          // The leaflet's base spans its segment, a little overlapping the next.
          l.scale.set(out, tiny(len * 1.15), out);
          l.rotation.z = w * 0.5; // leaflets fold back as they dry
        }
        prevLen = len;
      });
      f.tip.position.y = prevLen;
      const t = tiny(f.tipSize * tipOpen * (1 - 0.3 * w));
      f.tip.scale.set(t, t, t * 1.4);
    }
    applyColours(shifts, w);
    sprout.apply(growth, w);
  };

  apply();
  fitHeight(group, body, fullHeight("FERN") * (0.92 + rand() * 0.14));
  fitSprout(body, sprout, (g) => { growth = g; apply(); });

  return {
    group,
    setGrowth(t) { growth = clamp01(t); apply(); },
    setWithered(v) { withered = clamp01(v); apply(); },
    dispose: disposer(tr),
  };
}

// ---------------------------------------------------------------------------
// Shared by the berry bush and the tree: a faceted lump of leaves. A
// polyhedron whose corners are pushed in or out a little (the same amount for
// every copy of a corner, so the faces stay closed), so no two lumps match.

function lumpGeometry(tr: Tracker, kind: "dodeca" | "ico0" | "ico1", rand: () => number, jitter: number) {
  const g = kind === "dodeca" ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, kind === "ico1" ? 1 : 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const push = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let s = push.get(k);
    if (s === undefined) { s = 1 + (rand() - 0.5) * 2 * jitter; push.set(k, s); }
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return track(tr, g);
}

// ---------------------------------------------------------------------------
// Berry bush: a rounded clump of 3-5 faceted leaf masses, a big one in the
// middle and smaller ones leaning on it, dotted late with 6-10 red berries.
//
// After the sprout, the masses swell up out of the ground one after another
// (0.1-0.8), the middle one first; the berries ripen last, from 0.7 to 1, and
// are hidden before that. About 280 triangles with the sprout.

function buildBerryBush(seed: number, theme: Theme): PlantModel {
  const rand = mulberry32(seed);
  const pal = PALETTE[theme];
  const tr: Tracker = { geometries: [], materials: [] };

  const group = new THREE.Group();
  group.name = "berry-bush";
  const body = new THREE.Group();
  group.add(body);
  const sprout = buildSprout(tr, group, seed, pal);

  const leafMats = [material(tr, pal.bushLeaf), material(tr, pal.bushLeafDeep)];
  const berryMat = material(tr, pal.berry);
  const berryGeo = track(tr, new THREE.OctahedronGeometry(1, 0));
  const shifts: ColourShift[] = [
    { mat: leafMats[0], healthy: new THREE.Color(pal.bushLeaf), dried: STRAW },
    { mat: leafMats[1], healthy: new THREE.Color(pal.bushLeafDeep), dried: STRAW },
    { mat: berryMat, healthy: new THREE.Color(pal.berry), dried: DRIED_BERRY },
  ];

  type Mass = { mesh: THREE.Mesh; x: number; y: number; z: number; r: number; from: number; to: number; g: number };
  const masses: Mass[] = [];
  const count = 3 + Math.floor(rand() * 3); // 3-5
  const turn = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(lumpGeometry(tr, "dodeca", rand, 0.14), leafMats[i % 2]);
    mesh.rotation.y = rand() * Math.PI * 2; // about y only, so its box stays honest
    body.add(mesh);
    if (i === 0) {
      const r = 0.22 + rand() * 0.03;
      masses.push({ mesh, x: 0, y: r * 1.1, z: 0, r, from: 0.1, to: 0.55, g: 0 });
    } else {
      const a = turn + (i / (count - 1)) * Math.PI * 2 + (rand() - 0.5) * 0.6;
      const d = 0.1 + rand() * 0.04;
      const r = 0.13 + rand() * 0.03;
      masses.push({ mesh, x: Math.cos(a) * d, y: r * 0.95, z: Math.sin(a) * d, r, from: 0.15 + i * 0.08, to: 0.5 + i * 0.07, g: 0 });
    }
  }

  // Berries sit on the upper and outer faces of the masses.
  type Berry = { mesh: THREE.Mesh; mass: Mass; dx: number; dy: number; dz: number; size: number; from: number; to: number };
  const berries: Berry[] = [];
  const berryCount = 6 + Math.floor(rand() * 5); // 6-10
  for (let k = 0; k < berryCount; k++) {
    const mass = masses[k % count];
    const theta = rand() * Math.PI * 2;
    const phi = 0.3 + rand() * 0.9; // from the top, round to the side
    const mesh = new THREE.Mesh(berryGeo, berryMat);
    mesh.name = "berry";
    body.add(mesh);
    const at = k / berryCount;
    berries.push({
      mesh, mass, dx: Math.sin(phi) * Math.cos(theta), dy: Math.cos(phi), dz: Math.sin(phi) * Math.sin(theta),
      size: 0.034 + rand() * 0.01, from: 0.7 + at * 0.15, to: 0.85 + at * 0.14,
    });
  }

  let growth = 1;
  let withered = 0;
  const apply = () => {
    const w = withered;
    for (const m of masses) {
      // Each mass swells up out of the ground; withered ones slump.
      m.g = stage(growth, m.from, m.to);
      const r = m.r * m.g;
      m.mesh.position.set(m.x * (0.6 + 0.4 * m.g), m.y * m.g * (1 - 0.3 * w), m.z * (0.6 + 0.4 * m.g));
      m.mesh.scale.set(tiny(r * (1 + 0.08 * w)), tiny(r * 0.9 * (1 - 0.35 * w)), tiny(r * (1 + 0.08 * w)));
    }
    for (const b of berries) {
      const ripe = stage(growth, b.from, b.to);
      b.mesh.visible = ripe > 0;
      const m = b.mass;
      const r = m.r * m.g * 0.92;
      b.mesh.position.set(
        m.mesh.position.x + b.dx * r * (1 + 0.08 * w),
        m.mesh.position.y + b.dy * r * 0.9 * (1 - 0.35 * w),
        m.mesh.position.z + b.dz * r * (1 + 0.08 * w),
      );
      b.mesh.scale.setScalar(tiny(b.size * ripe * (1 - 0.35 * w)));
    }
    applyColours(shifts, w);
    sprout.apply(growth, w);
  };

  apply();
  fitHeight(group, body, fullHeight("BERRY_BUSH") * (0.92 + rand() * 0.14));
  fitSprout(body, sprout, (g) => { growth = g; apply(); });

  return {
    group,
    setGrowth(t) { growth = clamp01(t); apply(); },
    setWithered(v) { withered = clamp01(v); apply(); },
    dispose: disposer(tr),
  };
}

// ---------------------------------------------------------------------------
// Tree: one tree that grows through three stages, a session each.
//
// The whole tree is described by its age a in [0, 3]: 0 is the seedling,
// 1 the sapling (a thin, slightly crooked trunk with a small leaf tuft at the
// tip and two more on short twigs lower down), 2 the young tree (taller,
// straighter trunk with one short side branch, two overlapping canopy lumps
// of different sizes a little off-centre), 3 the mature tree (thick trunk,
// 3-5 lumps about 1.1 across, 2-3 low branches). A model built for stage s
// plays ages s - 1 to s as growth runs 0 to 1, so tending a tree carries on
// exactly where the last session left it.
//
// Every random choice is drawn up front in the same order for every stage, so
// a seed is the same tree at every stage; each stage only builds the meshes
// it can show (and the ones still fading out from the stage before). Height
// is not fitted: the trunk keyframes are set so the tree stands at about
// 0.8 / 1.3 / 1.9, times a per-seed size shared by all stages. The trunk
// eases within each stage, so growth settles at the end of one.
//
// Only the sapling can wither; setWithered does nothing at stages 2 and 3.

const TRUNK_HEIGHT = [0.03, 0.63, 0.92, 1.24] as const;
const TRUNK_RADIUS = [0.012, 0.028, 0.055, 0.092] as const;

// Ranges the plan draws from, as [lowest, spread]. MAX_CROWN_REACH is
// derived from the same numbers.
type Range = readonly [number, number];
const TREE_SIZE: Range = [0.92, 0.14];
const TREE_LEAN: Range = [0.03, 0.05]; // radians
const CROWN_JITTER = 0.12; // lumpGeometry jitter for canopy lumps
const TUFT_AT: Range = [0.55, 0.25]; // side tufts, as a fraction of the trunk
const TUFT_OUT: Range = [0.06, 0.03];
const TUFT0_R: Range = [0.16, 0.02]; // the tuft at the tip
const TUFT_R: Range = [0.08, 0.03];
const YOUNG0_R2: Range = [0.32, 0.03];
const YOUNG1_R2: Range = [0.2, 0.03];
const YOUNG1_D2: Range = [0.16, 0.04];
const YOUNG0_R3: Range = [0.4, 0.03];
const YOUNG0_D3 = 0.04;
const YOUNG0_LIFT2 = 0.1; // above the trunk top on the young tree
const YOUNG0_LIFT = 0.1 + 0.17; // above the trunk top when mature
const YOUNG0_OFF = 0.07; // the young tree's big lump sits this far off the trunk
const YOUNG0_K2 = 0.88; // young-tree lump radii, times r2
const YOUNG1_K2 = 1.1;
const TIP_TUFT_R = 0.62; // the sapling's tip tuft, times its planned radius
const TIP_TUFT_LIFT = 0.04;
const SIDE_TUFT_OUT = 2.3; // side tufts: twig length and radius, times the plan
const SIDE_TUFT_R = 1.1;
const SIDE_TUFT_LIFT = 0.07;
const SIDE_TUFT_AT = [0.3, 0.58] as const; // up the trunk, plus up to SIDE_TUFT_RISE
const SIDE_TUFT_RISE = 0.1;
const SAPLING_KEEL = 0.4; // radians a withered sapling keels over
const YOUNG1_R3: Range = [0.28, 0.03];
const YOUNG1_D3: Range = [0.28, 0.04];
const MATURE_D: Range = [0.24, 0.04];
const MATURE_R: Range = [0.24, 0.04];
const MATURE_DY: Range = [-0.12, 0.14];
const BRANCH_AT: Range = [0.38, 0.2];
const BRANCH_PITCH: Range = [0.85, 0.3];
const BRANCH_LEN: Range = [0.26, 0.08];
const BRANCH_R: Range = [0.09, 0.03];
const YOUNG_BRANCH = 0.5; // how far the first branch reaches on the young tree

const hi = (r: Range) => r[0] + r[1];
const draw = (r: Range, rand: () => number) => r[0] + rand() * r[1];

/**
 * The farthest any part of a tree reaches sideways from the base of its
 * trunk, at any stage: the widest mature crown lump (corner jitter included)
 * at the largest seeded size, pushed out by the greatest lean. A leaning
 * point at height y moves at most y * sin(lean) sideways. Later stages always
 * reach farther than earlier ones, so the mature crown bounds them all.
 */
export const MAX_CROWN_REACH = (() => {
  const top = TRUNK_HEIGHT[3];
  const j = 1 + CROWN_JITTER;
  const s = Math.sin(hi(TREE_LEAN));
  const out = (h: number, y: number) => h + y * s;
  return hi(TREE_SIZE) * Math.max(
    out(YOUNG0_D3 + hi(YOUNG0_R3) * j, top + YOUNG0_LIFT + hi(YOUNG0_R3) * j),
    out(hi(YOUNG1_D3) + hi(YOUNG1_R3) * j, top + hi(YOUNG1_R3) * j),
    out(hi(MATURE_D) + hi(MATURE_R) * j, top + hi(MATURE_DY) + hi(MATURE_R) * j),
    out(hi(BRANCH_LEN) * Math.sin(hi(BRANCH_PITCH)) + hi(BRANCH_R) * j,
      top * hi(BRANCH_AT) + hi(BRANCH_LEN) + hi(BRANCH_R) * j),
  );
})();

// The sapling's crook: the top part of the trunk bends off by this much
// (radians, the low end plus up to the spread), and straightens out while it
// grows into a young tree.
const SAPLING_BEND: Range = [0.18, 0.14];
const SAPLING_KINK_AT = 0.58; // fraction of the trunk where it bends

/** Eases between keyframes at whole ages. */
function keyed(k: readonly number[], a: number) {
  const i = Math.min(k.length - 2, Math.max(0, Math.floor(a)));
  const x = clamp01(a - i);
  return k[i] + (k[i + 1] - k[i]) * x * x * (3 - 2 * x);
}

/**
 * How far the bent top of a sapling's trunk sits off the trunk's line, at
 * most, before it straightens (ages 0-2): the leader's length times the sine
 * of its bend, on the same curves apply() uses, at the largest bend.
 */
const LEADER_SIDE = (() => {
  let far = 0;
  for (let k = 0; k <= 400; k++) {
    const a = k / 200;
    const straight = stage(a, 1.05, 1.9);
    const leadL = keyed(TRUNK_HEIGHT, a) * (1 - SAPLING_KINK_AT) * (1 - straight);
    far = Math.max(far, leadL * Math.sin(hi(SAPLING_BEND) * (1 - straight)));
  }
  return far * 1.01; // sampled, so a hair of room
})();

/**
 * The farthest a sapling or young tree (stage 1 or 2, any age up to 2) reaches
 * sideways from the base of its trunk, from the same numbers the plan draws
 * from, like MAX_CROWN_REACH: the tufts and their twigs (off the bent leader),
 * the two young lumps and the half-grown first branch, at the largest seeded
 * size and the greatest lean. A withered sapling also keels over by
 * SAPLING_KEEL. The sprout sits outside the sized body and leans on its own.
 */
export const YOUNG_TREE_REACH = (() => {
  const j = 1 + CROWN_JITTER;
  const at = (lean: number) => (h: number, y: number) => h + y * Math.sin(lean);
  // g: how big the tufts are (withering shrinks them by up to 0.4).
  const tufts = (top: number, g: number, out: (h: number, y: number) => number) => {
    const tip = hi(TUFT0_R) * TIP_TUFT_R * j * g;
    const side = hi(TUFT_R) * SIDE_TUFT_R * j * g;
    const sideAt = Math.max(...SIDE_TUFT_AT) + SIDE_TUFT_RISE;
    return Math.max(
      out(LEADER_SIDE + TIP_TUFT_LIFT * g + tip, top + TIP_TUFT_LIFT * g + tip),
      out(LEADER_SIDE + (hi(TUFT_OUT) * SIDE_TUFT_OUT + side) * g, top * sideAt + SIDE_TUFT_LIFT * g + side),
    );
  };
  // Stage 1 (ages 0-1), healthy through fully withered: withering keels the
  // tree over, lowers it by 10 % and shrinks the tufts, all at once.
  let sapling = 0;
  for (let k = 0; k <= 20; k++) {
    const w = k / 20;
    sapling = Math.max(sapling, tufts(TRUNK_HEIGHT[1] * (1 - 0.1 * w), 1 - 0.4 * w, at(hi(TREE_LEAN) + SAPLING_KEEL * w)));
  }
  // Stage 2 (ages 1-2): the tufts fade as the young lumps and first branch grow in.
  const top2 = TRUNK_HEIGHT[2];
  const out = at(hi(TREE_LEAN));
  const r0 = hi(YOUNG0_R2) * YOUNG0_K2 * j;
  const r1 = hi(YOUNG1_R2) * YOUNG1_K2 * j;
  const br = YOUNG_BRANCH * hi(BRANCH_R) * j;
  const bl = YOUNG_BRANCH * hi(BRANCH_LEN);
  const young = Math.max(
    tufts(top2, 1, out),
    out(LEADER_SIDE + YOUNG0_OFF + r0, top2 + YOUNG0_LIFT2 + r0),
    out(LEADER_SIDE + hi(YOUNG1_D2) + r1, top2 + r1),
    out(bl * Math.sin(hi(BRANCH_PITCH)) + br, top2 * hi(BRANCH_AT) + bl + br),
  );
  // The sprout: its leaves' reach plus how far its stem's lean (at most 0.12,
  // plus 0.45 withered) tips their base.
  const sprout = SPROUT_LEAF * 1.06 + SPROUT_HEIGHT * Math.sin(0.12 + 0.45);
  return Math.max(hi(TREE_SIZE) * Math.max(sapling, young), sprout);
})();

/**
 * Bounds for the other species, which are fitted to their height when built
 * (fitHeight), so their spread can't be read off constants: the most each
 * reaches in any state over 40 seeds (wildflowers and ferns lie flat when
 * withered), plus about 4 %. The sweep in models.test.ts proves them.
 */
const SMALL_REACH = { WILDFLOWERS: 0.76, FERN: 0.69, BERRY_BUSH: 0.41 } as const;

/** How far a plant of this species and stage can reach sideways from its spot centre, in any state. */
export function plantReach(species: Species, stage = 1): number {
  if (species === "TREE") return treeStage(stage) === 3 ? MAX_CROWN_REACH : YOUNG_TREE_REACH;
  return SMALL_REACH[species];
}

function buildTree(seed: number, theme: Theme, stageIn: number): PlantModel {
  const st = treeStage(stageIn);
  const rand = mulberry32(seed);
  const pal = PALETTE[theme];
  const tr: Tracker = { geometries: [], materials: [] };

  // --- The plan, drawn in a fixed order whatever the stage. ---
  const size = draw(TREE_SIZE, rand);
  const yaw = rand() * Math.PI * 2;
  const lean = draw(TREE_LEAN, rand);
  const tuftPlan = [0, 1, 2].map((i) => ({
    at: i === 0 ? 1 : draw(TUFT_AT, rand), turn: rand() * Math.PI * 2,
    out: i === 0 ? 0 : draw(TUFT_OUT, rand), r: i === 0 ? draw(TUFT0_R, rand) : draw(TUFT_R, rand),
  }));
  const youngCount = rand() < 0.5 ? 1 : 2;
  const youngPlan = [0, 1].map((i) => ({
    turn: rand() * Math.PI * 2, r2: i === 0 ? draw(YOUNG0_R2, rand) : draw(YOUNG1_R2, rand),
    r3: i === 0 ? draw(YOUNG0_R3, rand) : draw(YOUNG1_R3, rand),
    d2: i === 0 ? 0 : draw(YOUNG1_D2, rand), d3: i === 0 ? YOUNG0_D3 : draw(YOUNG1_D3, rand), drop: i === 0 ? 0 : 0.1 + rand() * 0.05,
  }));
  const total = 3 + Math.floor(rand() * 3); // 3-5 lumps when mature
  const turn0 = rand() * Math.PI * 2;
  const maturePlan = [0, 1, 2, 3].map((i) => ({
    turn: turn0 + (i / 4) * Math.PI * 2 + (rand() - 0.5) * 0.5, d: draw(MATURE_D, rand),
    r: draw(MATURE_R, rand), dy: draw(MATURE_DY, rand),
  }));
  const branchCount = 2 + Math.floor(rand() * 2); // 2-3
  const branchPlan = [0, 1, 2].map((i) => ({
    at: draw(BRANCH_AT, rand), turn: (i / 3) * Math.PI * 2 + rand() * 1.2,
    pitch: draw(BRANCH_PITCH, rand), len: draw(BRANCH_LEN, rand), r: draw(BRANCH_R, rand),
  }));
  // Each lump's corners come from its own stream, so building one lump never
  // changes another.
  const lumpRand = (k: number) => mulberry32((seed ^ 0x7ee5) + k * 0x9e3779b1);

  // Sapling and young-tree details come from numbers already drawn, so the
  // plan (and the mature tree) is the same as before they were added.
  const u = (tuftPlan[0].r - TUFT0_R[0]) / TUFT0_R[1]; // 0..1
  const bend = SAPLING_BEND[0] + u * SAPLING_BEND[1];
  const bendTurn = tuftPlan[0].turn;
  // Side tufts: one low, one higher, on roughly opposite sides.
  const sideTufts = [1, 2].map((i) => {
    const p = tuftPlan[i];
    const v = (p.at - TUFT_AT[0]) / TUFT_AT[1]; // 0..1
    return {
      at: SIDE_TUFT_AT[i - 1] + v * SIDE_TUFT_RISE,
      turn: i === 1 ? p.turn : tuftPlan[1].turn + Math.PI * 0.8 + v * 0.5,
      out: p.out * SIDE_TUFT_OUT, r: p.r * SIDE_TUFT_R,
    };
  });
  // At the young stage the big lump sits a little off the trunk, away from the small one.
  const young0Turn = youngPlan[1].turn + Math.PI;

  // --- The meshes this stage can show. ---
  const group = new THREE.Group();
  group.name = "tree";
  const body = new THREE.Group();
  body.scale.setScalar(size);
  group.add(body);
  const sprout = st === 1 ? buildSprout(tr, group, seed, pal) : null;
  const tilt = new THREE.Group();
  tilt.rotation.order = "YXZ";
  tilt.rotation.y = yaw;
  body.add(tilt);

  const barkMat = material(tr, pal.bark);
  const canopyMats = [material(tr, pal.canopy), material(tr, pal.canopyDeep)];
  const shifts: ColourShift[] = [
    { mat: barkMat, healthy: new THREE.Color(pal.bark), dried: STRAW },
    { mat: canopyMats[0], healthy: new THREE.Color(pal.canopy), dried: STRAW },
    { mat: canopyMats[1], healthy: new THREE.Color(pal.canopyDeep), dried: STRAW },
  ];
  const trunk = new THREE.Mesh(prismGeometry(tr, 6, 0.55), barkMat);
  trunk.name = "trunk";
  tilt.add(trunk);
  // The bent top of a sapling's trunk, straight and gone by the end of stage 2.
  const leader = st <= 2 ? new THREE.Mesh(prismGeometry(tr, 6, 0.6), barkMat) : null;
  if (leader) {
    leader.rotation.order = "YXZ";
    tilt.add(leader);
  }

  type Lump = { mesh: THREE.Mesh };
  const lump = (k: number, kind: "ico0" | "ico1", mat: number): Lump => {
    const mesh = new THREE.Mesh(lumpGeometry(tr, kind, lumpRand(k), CROWN_JITTER), canopyMats[mat]);
    mesh.rotation.y = lumpRand(k + 100)() * Math.PI * 2;
    tilt.add(mesh);
    return { mesh };
  };
  const tufts = st <= 2 ? tuftPlan.map((p, i) => ({ p, ...lump(i, "ico0", i % 2) })) : [];
  const twigGeo = st <= 2 ? prismGeometry(tr, 5, 0.5) : null;
  const twigs = twigGeo ? sideTufts.map(() => {
    const m = new THREE.Mesh(twigGeo, barkMat);
    tilt.add(m);
    return m;
  }) : [];
  // Young trees always show two lumps; when the mature tree keeps only one
  // of them, the other shrinks away while the mature lumps grow in.
  const young = st >= 2 ? youngPlan.map((p, i) => ({ p, ...lump(10 + i, "ico1", i % 2) })) : [];
  const mature = st === 3 ? maturePlan.slice(0, total - youngCount).map((p, i) => ({ p, ...lump(20 + i, "ico1", (i + 1) % 2) })) : [];
  // The first low branch already shows, short, on the young tree.
  const branchGeo = st >= 2 ? prismGeometry(tr, 5, 0.5) : null;
  const branches = branchGeo
    ? branchPlan.slice(0, st === 3 ? branchCount : 1).map((p, i) => {
        const pivot = new THREE.Group();
        pivot.rotation.order = "YXZ";
        pivot.rotation.set(0, p.turn, -p.pitch);
        tilt.add(pivot);
        const limb = new THREE.Mesh(branchGeo, barkMat);
        pivot.add(limb);
        const leaves = new THREE.Mesh(lumpGeometry(tr, "ico0", lumpRand(30 + i), CROWN_JITTER), canopyMats[i % 2]);
        pivot.add(leaves);
        return { p, pivot, limb, leaves };
      })
    : [];

  const UP = new THREE.Vector3(0, 1, 0);
  const leaderEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const leaderDir = new THREE.Vector3();
  const kink = new THREE.Vector3();
  const topV = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const twigDir = new THREE.Vector3();

  let growth = 1;
  let withered = 0;
  const apply = () => {
    const a = st - 1 + growth;
    const w = st === 1 ? withered : 0;
    const T = keyed(TRUNK_HEIGHT, a);
    const R = keyed(TRUNK_RADIUS, a);
    tilt.rotation.z = -(lean + w * SAPLING_KEEL); // a withered sapling keels over
    const height = T * (1 - 0.1 * w);

    // The trunk: straight up to the kink, then the leader bends off. It
    // straightens through stage 2, until the leader has no length left.
    const straight = stage(a, 1.05, 1.9);
    const lowH = height * lerp(SAPLING_KINK_AT, 1, straight);
    const leadL = height - lowH;
    trunk.scale.set(R, tiny(lowH), R);
    kink.set(0, lowH, 0);
    leaderEuler.set(0, bendTurn, -bend * (1 - straight));
    leaderDir.copy(UP).applyEuler(leaderEuler);
    if (leader) {
      leader.position.copy(kink);
      leader.rotation.copy(leaderEuler);
      const r = R * 0.55 * (1 - straight * 0.5);
      leader.scale.set(tiny(r), tiny(leadL), tiny(r));
    }
    /** A point a fraction f of the way up the trunk. */
    const along = (f: number, into: THREE.Vector3) => {
      const y = f * height;
      return y <= lowH ? into.set(0, y, 0) : into.copy(kink).addScaledVector(leaderDir, y - lowH);
    };
    along(1, topV);
    const top = topV.y;

    // Sapling tufts grow in, then shrink away as the canopy takes over: a
    // small one at the tip, two on twigs lower down.
    const tuft = stage(a, 0.25, 0.9) * (1 - stage(a, 1.55, 1.95));
    for (let i = 0; i < tufts.length; i++) {
      const { p, mesh } = tufts[i];
      const g = tuft * (1 - 0.4 * w);
      if (i === 0) {
        const r = p.r * TIP_TUFT_R;
        mesh.position.copy(topV).addScaledVector(leaderDir, TIP_TUFT_LIFT * g);
        mesh.scale.set(tiny(r * g), tiny(r * g * 0.85), tiny(r * g));
        continue;
      }
      const s = sideTufts[i - 1];
      along(s.at, pt);
      twigDir.set(Math.cos(s.turn) * s.out, SIDE_TUFT_LIFT, Math.sin(s.turn) * s.out).multiplyScalar(g);
      mesh.position.copy(pt).add(twigDir);
      mesh.scale.set(tiny(s.r * g), tiny(s.r * g * 0.85), tiny(s.r * g));
      const twig = twigs[i - 1];
      const len = twigDir.length();
      twig.position.copy(pt);
      if (len > 1e-6) twig.quaternion.setFromUnitVectors(UP, twigDir.normalize());
      const twigR = R * 0.3 * g;
      twig.scale.set(tiny(twigR), tiny(len), tiny(twigR));
    }
    // Young lumps swell at the top (age 1-1.9) and keep growing when mature.
    const ripen = stage(a, 2, 2.9);
    for (let i = 0; i < young.length; i++) {
      const { p, mesh } = young[i];
      const g = i === 0 ? stage(a, 1, 1.75) : stage(a, 1.2, 1.9);
      // A second lump the mature tree does not keep fades as the crown fills in.
      const fade = i >= youngCount ? 1 - stage(a, 2, 2.6) : 1;
      const k2 = i === 0 ? YOUNG0_K2 : YOUNG1_K2;
      const r = (p.r2 * k2 * g + (p.r3 - p.r2 * k2) * ripen) * fade;
      let x: number, z: number;
      if (i === 0) {
        // Off the trunk towards young0Turn, moving to its mature place.
        const off = YOUNG0_OFF * g;
        x = lerp(Math.cos(young0Turn) * off, Math.cos(p.turn) * p.d3, ripen);
        z = lerp(Math.sin(young0Turn) * off, Math.sin(p.turn) * p.d3, ripen);
      } else {
        const d = p.d2 * g + (p.d3 - p.d2) * ripen;
        x = Math.cos(p.turn) * d;
        z = Math.sin(p.turn) * d;
      }
      const y = top + (i === 0 ? YOUNG0_LIFT2 * g + (YOUNG0_LIFT - YOUNG0_LIFT2) * ripen : -p.drop * g);
      mesh.position.set(topV.x + x, y, topV.z + z);
      mesh.scale.set(tiny(r), tiny(r * 0.85), tiny(r));
    }
    // Mature lumps spread the crown out to about 1.1 across.
    for (let i = 0; i < mature.length; i++) {
      const { p, mesh } = mature[i];
      const g = stage(a, 2 + i * 0.1, 2.6 + i * 0.1);
      const d = p.d * (0.5 + 0.5 * g);
      mesh.position.set(Math.cos(p.turn) * d, top + p.dy * g, Math.sin(p.turn) * d);
      mesh.scale.set(tiny(p.r * g), tiny(p.r * g * 0.85), tiny(p.r * g));
    }
    // Low branches reach out late, each ending in a small tuft; the first
    // already reaches halfway on the young tree.
    const late = stage(a, 2.1, 2.9);
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      const reach = i === 0 ? YOUNG_BRANCH * stage(a, 1.15, 1.8) + (1 - YOUNG_BRANCH) * late : late;
      b.pivot.position.y = T * b.p.at;
      const len = b.p.len * reach;
      const r = R * 0.35 * (0.4 + 0.6 * reach);
      b.limb.scale.set(r, tiny(len), r);
      b.leaves.position.y = len;
      b.leaves.scale.set(tiny(b.p.r * reach), tiny(b.p.r * reach * 0.8), tiny(b.p.r * reach));
    }
    applyColours(shifts, w);
    sprout?.apply(growth, w);
  };

  apply();
  if (sprout) fitSprout(body, sprout, (g) => { growth = g; apply(); });

  return {
    group,
    setGrowth(t) { growth = clamp01(t); apply(); },
    setWithered(v) {
      if (st !== 1) return; // only a sapling can be lost
      withered = clamp01(v); apply();
    },
    dispose: disposer(tr),
  };
}

/** `stage` only matters for TREE (1 sapling, 2 young, 3 mature). */
export function buildPlant(species: Species, seed: number, theme: Theme, stage = 1): PlantModel {
  switch (species) {
    case "FERN": return buildFern(seed, theme);
    case "BERRY_BUSH": return buildBerryBush(seed, theme);
    case "TREE": return buildTree(seed, theme, stage);
    default: return buildWildflowers(seed, theme);
  }
}

// ---------------------------------------------------------------------------
// Island: a low faceted mound of grass on a thick earthy skirt, no water.
//
// The top is a jittered grid, warped from a square onto the island's
// irregular rounded-square outline (about 0.6 beyond the n x n planting
// grid). It is flat at y = 0 over the planting grid plus a small margin and
// rolls gently down towards the rim. Each facet takes one of three close
// greens. The soil skirt runs from the rim down about 0.5 to a narrower base,
// darkening towards the bottom.

const ISLAND_MAX_CELLS = 16;

/** Distance along direction (cos a, sin a) to the edge of a rounded square. */
function roundedSquareRadius(half: number, offset: number, a: number) {
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const sd = (t: number) => {
    const qx = Math.max(Math.abs(dx * t) - half, 0);
    const qz = Math.max(Math.abs(dz * t) - half, 0);
    const outside = Math.hypot(qx, qz);
    const inside = Math.min(Math.max(Math.abs(dx * t), Math.abs(dz * t)) - half, 0);
    return outside + inside - offset;
  };
  let lo = 0;
  let hi = (half + offset) * 2;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (sd(mid) > 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function buildIsland(n: number, theme: Theme): { group: THREE.Group; dispose(): void } {
  const rand = mulberry32(n * 7919 + 17);
  const pal = PALETTE[theme];
  const tr: Tracker = { geometries: [], materials: [] };
  const half = n / 2;
  const flatHalf = half + 0.2;
  const cells = Math.min(n + 2, ISLAND_MAX_CELLS);

  // Irregular outline: a few seeded waves round the rim.
  const waves = [1, 2, 3].map((k) => ({ k: k + 1, amp: rand() * 0.06, ph: rand() * Math.PI * 2 }));
  const outlineOffset = (a: number) =>
    0.6 + waves.reduce((s, w) => s + w.amp * (1 + Math.sin(w.k * a + w.ph)), 0);

  // Grid points in uv in [-1, 1]^2, interior ones jittered, then warped so
  // the square's ring at max(|u|,|v|) = s lands at s times the outline.
  const step = 2 / cells;
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= cells; i++) {
    grid.push([]);
    for (let j = 0; j <= cells; j++) {
      let u = -1 + i * step;
      let v = -1 + j * step;
      const edge = i === 0 || j === 0 || i === cells || j === cells;
      if (!edge) {
        u += (rand() - 0.5) * step * 0.55;
        v += (rand() - 0.5) * step * 0.55;
      }
      const s = Math.max(Math.abs(u), Math.abs(v));
      const a = Math.atan2(v, u);
      const r = s === 0 ? 0 : s * roundedSquareRadius(half, outlineOffset(a), a);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Flat over the planting grid; beyond it, roll down to the rim.
      const beyond = Math.max(Math.abs(x), Math.abs(z)) - flatHalf;
      let y = 0;
      if (beyond > 0) {
        const rimDist = Math.max(0.05, roundedSquareRadius(half, outlineOffset(a), a) - flatHalf / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))));
        const e = Math.min(1, beyond / rimDist);
        y = -0.13 * e * e - (edge ? 0.02 + rand() * 0.03 : rand() * 0.02 * e);
      }
      grid[i].push(new THREE.Vector3(x, y, z));
    }
  }

  type Tri = { p: THREE.Vector3; q: THREE.Vector3; r: THREE.Vector3 };
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  /** Adds a triangle wound so its normal points along `want`. */
  const add = (out: Tri[], p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, want: THREE.Vector3) => {
    ab.subVectors(q, p);
    ac.subVectors(r, p);
    const flip = ab.cross(ac).dot(want) < 0;
    out.push(flip ? { p, q: r, r: q } : { p, q, r });
  };

  const up = new THREE.Vector3(0, 1, 0);
  const grassTris: Tri[] = [];
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      if (rand() < 0.5) {
        add(grassTris, a, b, c, up);
        add(grassTris, a, c, d, up);
      } else {
        add(grassTris, a, b, d, up);
        add(grassTris, b, c, d, up);
      }
    }
  }

  // The rim: the grid's border, walked once round.
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i < cells; i++) rim.push(grid[i][0]);
  for (let j = 0; j < cells; j++) rim.push(grid[cells][j]);
  for (let i = cells; i > 0; i--) rim.push(grid[i][cells]);
  for (let j = cells; j > 0; j--) rim.push(grid[0][j]);
  const m = rim.length;
  // Nearly vertical at first so the camera sees the earth, then tucking in.
  const mid = rim.map((p) => new THREE.Vector3(p.x * 0.995, p.y - 0.22 - rand() * 0.06, p.z * 0.995));
  const base = rim.map((p) => new THREE.Vector3(p.x * 0.88, -0.46 - rand() * 0.08, p.z * 0.88));
  const bottom = new THREE.Vector3(0, -0.58, 0);

  const outward = (p: THREE.Vector3, q: THREE.Vector3) =>
    new THREE.Vector3((p.x + q.x) / 2, 0, (p.z + q.z) / 2).normalize().setY(-0.3);
  const upperSoil: Tri[] = [];
  const lowerSoil: Tri[] = [];
  const underside: Tri[] = [];
  for (let i = 0; i < m; i++) {
    const k = (i + 1) % m;
    const o = outward(rim[i], rim[k]);
    add(upperSoil, rim[i], rim[k], mid[i], o);
    add(upperSoil, rim[k], mid[k], mid[i], o);
    add(lowerSoil, mid[i], mid[k], base[i], o);
    add(lowerSoil, mid[k], base[k], base[i], o);
    add(underside, bottom, base[i], base[k], new THREE.Vector3(0, -1, 0));
  }

  // Each facet takes one of a few close shades of its base colour.
  const shades = (hex: number, steps: [number, number][]) => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return steps.map(([dh, dl]) => new THREE.Color().setHSL(hsl.h + dh, hsl.s, hsl.l * dl));
  };
  const greens = shades(pal.grass, [[0, 1], [0.012, 1.07], [-0.015, 0.93]]);
  const soilUpper = shades(pal.soil, [[0, 1], [0.01, 1.06], [-0.01, 0.94]]);
  const soilLower = shades(pal.soilDeep, [[0, 1.08], [0.01, 1], [-0.01, 0.92]]);
  const soilBottom = shades(pal.soilDeep, [[0, 0.75]]);

  const build = (sets: [Tri[], THREE.Color[]][]) => {
    const pos: number[] = [];
    const col: number[] = [];
    for (const [tris, palette] of sets) {
      for (const { p, q, r } of tris) {
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
        const c = palette[Math.floor(rand() * palette.length)];
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return track(tr, g);
  };

  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const soilMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  tr.materials.push(grassMat, soilMat);

  const group = new THREE.Group();
  group.name = "island";
  const grass = new THREE.Mesh(build([[grassTris, greens]]), grassMat);
  const soil = new THREE.Mesh(build([[upperSoil, soilUpper], [lowerSoil, soilLower], [underside, soilBottom]]), soilMat);
  group.add(grass, soil);

  return { group, dispose: disposer(tr) };
}
