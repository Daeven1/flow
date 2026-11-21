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

export function fullHeight(species: Species): number {
  // TODO(Task 4): real heights for BERRY_BUSH and TREE; they borrow wildflowers for now.
  return species === "FERN" ? 0.6 : 0.7;
}

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
  },
} as const;

const STRAW = new THREE.Color(0xc4ad74);
const DRIED_BLOOM = new THREE.Color(0x9c7b52);

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

export function buildPlant(species: Species, seed: number, theme: Theme): PlantModel {
  // TODO(Task 4): real BERRY_BUSH and TREE models; they borrow wildflowers for now.
  return species === "FERN" ? buildFern(seed, theme) : buildWildflowers(seed, theme);
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
