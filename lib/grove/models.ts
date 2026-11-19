/**
 * Low-poly focus-grove shapes, built in code with three.js.
 *
 * Everything here is plain geometry and materials (no renderer, no DOM), so it
 * runs in Vitest's node environment. Every material is flat shaded, there are
 * no textures and no model files, and all randomness comes from mulberry32 so
 * the same seed always gives the same plant.
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
  return species === "WILDFLOWERS" ? 0.5 : 0.45;
}

/** Spots are 1 unit apart; {x:-0.5,y:-0.5} is the origin; grid y is world z. */
export function spotToWorld(spot: Spot): THREE.Vector3 {
  return new THREE.Vector3(spot.x + 0.5, 0, spot.y + 0.5);
}

// ---------------------------------------------------------------------------
// Palette

const PALETTE = {
  light: {
    stem: 0x5f8f3e,
    leaf: 0x72a64a,
    fern: 0x4f8f3f,
    fernRachis: 0x5a7f35,
    blooms: [0xf2c230, 0xf08a6c, 0xb497d6], // buttercup, soft coral, lilac
    bloomCentre: 0xc98a2e,
    grass: 0x7db356,
    soil: 0x8b6a47,
  },
  dark: {
    // Deeper, more saturated greens; blooms kept bright against Midnight Navy.
    stem: 0x3f7f2a,
    leaf: 0x4a9c30,
    fern: 0x2f8a36,
    fernRachis: 0x3c6e26,
    blooms: [0xffd23f, 0xff8e72, 0xc9a8ff],
    bloomCentre: 0xe8a33c,
    grass: 0x4e9a3a,
    soil: 0x5e4430,
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
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts });
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

/** Thin open tube of unit height with its base at y = 0. */
function stalkGeometry(tr: Tracker, rTop: number, rBottom: number, sides: number) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, 1, sides, 1, true);
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
// Wildflowers: a clump of 5-7 thin stems with small faceted blooms.
//
// Each stem is two straight pieces joined at a knee so it can arch and droop.
// Stems rise first (t 0-0.5), leaves unfold (0.3-0.8), blooms open (0.7-1).

function petalGeometry(tr: Tracker) {
  // Five petals as a shallow star-shaped cup: a raised centre, petal tips
  // tilted up, notches between them. Unit radius.
  const pts: number[] = [];
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tip = i % 2 === 0;
    const r = tip ? 1 : 0.42;
    rim.push(new THREE.Vector3(Math.cos(a) * r, tip ? 0.32 : 0.08, Math.sin(a) * r));
  }
  const c = new THREE.Vector3(0, 0.05, 0);
  for (let i = 0; i < 10; i++) {
    const p = rim[i];
    const q = rim[(i + 1) % 10];
    pts.push(c.x, c.y, c.z, q.x, q.y, q.z, p.x, p.y, p.z);
  }
  return fromTriangles(tr, pts);
}

function leafGeometry(tr: Tracker) {
  // A flat diamond leaf pointing along +x, unit length, in the x-z plane.
  return fromTriangles(tr, [
    0, 0, 0, 0.5, 0.02, -0.18, 1, 0.06, 0,
    0, 0, 0, 1, 0.06, 0, 0.5, 0.02, 0.18,
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

  // Shared within the plant.
  const stalkGeo = stalkGeometry(tr, 0.006, 0.01, 4);
  const petalGeo = petalGeometry(tr);
  const centreGeo = track(tr, new THREE.OctahedronGeometry(1, 0));
  const leafGeo = leafGeometry(tr);

  const stemMat = material(tr, pal.stem);
  const leafMat = material(tr, pal.leaf, { side: THREE.DoubleSide });
  const centreMat = material(tr, pal.bloomCentre);

  // Two or three bloom colours from the warm palette.
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

  type Stem = {
    pivot: THREE.Group; lean: number; yaw: number;
    lower: THREE.Mesh; lowerLen: number;
    knee: THREE.Group; bend: number;
    upper: THREE.Mesh; upperLen: number;
    leaves: { holder: THREE.Group; mesh: THREE.Mesh; at: number; size: number }[];
    bloomHolder: THREE.Group; bloom: THREE.Group; bloomSize: number;
  };
  const stems: Stem[] = [];
  const count = 5 + Math.floor(rand() * 3); // 5-7
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * Math.PI * 2 + rand() * 0.8;
    const r = 0.015 + rand() * 0.05;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(yaw) * r, 0, Math.sin(yaw) * r);
    pivot.rotation.order = "YXZ";
    body.add(pivot);

    const len = 0.32 + rand() * 0.2;
    const lowerLen = len * (0.55 + rand() * 0.1);
    const upperLen = len - lowerLen;

    const lower = new THREE.Mesh(stalkGeo, stemMat);
    pivot.add(lower);

    const leaves: Stem["leaves"] = [];
    const leafCount = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < leafCount; k++) {
      const holder = new THREE.Group();
      holder.rotation.order = "YXZ";
      holder.rotation.y = rand() * Math.PI * 2;
      holder.rotation.z = 0.5 + rand() * 0.4; // tilt the leaf tip upwards
      const mesh = new THREE.Mesh(leafGeo, leafMat);
      holder.add(mesh);
      pivot.add(holder);
      leaves.push({ holder, mesh, at: 0.35 + rand() * 0.35, size: 0.07 + rand() * 0.04 });
    }

    const knee = new THREE.Group();
    pivot.add(knee);
    const upper = new THREE.Mesh(stalkGeo, stemMat);
    knee.add(upper);

    const bloomHolder = new THREE.Group();
    knee.add(bloomHolder);
    const bloom = new THREE.Group();
    bloomHolder.add(bloom);
    const petals = new THREE.Mesh(petalGeo, bloomMats[Math.floor(rand() * bloomMats.length)]);
    const centre = new THREE.Mesh(centreGeo, centreMat);
    centre.scale.set(0.28, 0.2, 0.28);
    centre.position.y = 0.08;
    bloom.add(petals, centre);
    bloom.rotation.y = rand() * Math.PI;

    stems.push({
      pivot, yaw, lean: 0.08 + rand() * 0.3,
      lower, lowerLen, knee, bend: 0.05 + rand() * 0.2, upper, upperLen,
      leaves, bloomHolder, bloom, bloomSize: 0.035 + rand() * 0.02,
    });
  }

  let growth = 1;
  let withered = 0;
  const apply = () => {
    const rise = stage(growth, 0, 0.5);
    const unfold = stage(growth, 0.3, 0.8);
    const open = stage(growth, 0.7, 1);
    const w = withered;
    for (const s of stems) {
      // Young stems stand straighter; withered ones lean and droop.
      s.pivot.rotation.set(0, s.yaw, -(s.lean * (0.5 + 0.5 * rise) + w * 0.55));
      const thick = 0.4 + 0.6 * rise;
      s.lower.scale.set(thick, tiny(s.lowerLen * rise), thick);
      s.knee.position.y = s.lowerLen * rise;
      s.knee.rotation.z = -(s.bend * rise + w * 0.6);
      s.upper.scale.set(thick, tiny(s.upperLen * rise), thick);
      s.bloomHolder.position.y = s.upperLen * rise;
      s.bloomHolder.rotation.z = -w * 0.7; // heads hang
      s.bloom.scale.setScalar(tiny(s.bloomSize * open * (1 - 0.45 * w)));
      for (const l of s.leaves) {
        l.holder.position.y = s.lowerLen * rise * l.at;
        l.mesh.scale.setScalar(tiny(l.size * unfold * (1 - 0.25 * w)));
        l.mesh.rotation.z = -w * 0.45; // leaves sag
      }
    }
    applyColours(shifts, w);
  };

  apply();
  fitHeight(group, body, fullHeight("WILDFLOWERS") * (0.92 + rand() * 0.14));

  return {
    group,
    setGrowth(t) { growth = clamp01(t); apply(); },
    setWithered(v) { withered = clamp01(v); apply(); },
    dispose: disposer(tr),
  };
}

// ---------------------------------------------------------------------------
// Fern: 6-8 arching fronds of flat tapered leaflets.
//
// Each frond is a chain of segments; each joint bends a little so the frond
// arches. While young the joints are curled tight like a fiddlehead and
// uncurl as the frond unfolds. Fronds rise first (0-0.5), leaflets unfold
// from the base outwards (0.3-0.8), and the tip opens last (0.7-1).

const FROND_SEGMENTS = 4;

function leafletGeometry(tr: Tracker) {
  // A tapered leaflet in the y-z plane (x = 0), base on the rachis, reaching
  // out along +z and sweeping slightly towards the frond tip (+y). Unit size.
  return fromTriangles(tr, [
    0, 0, 0, 0, 0.32, 0.38, 0, 0.22, 1,
    0, 0, 0, 0, 0.22, 1, 0, -0.04, 0.45,
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

  const rachisGeo = stalkGeometry(tr, 0.005, 0.009, 3);
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
  const count = 6 + Math.floor(rand() * 3); // 6-8
  for (let i = 0; i < count; i++) {
    const yawGroup = new THREE.Group();
    yawGroup.rotation.y = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    body.add(yawGroup);
    const tilt = new THREE.Group(); // leans the frond outwards (+x)
    yawGroup.add(tilt);

    const length = 0.38 + rand() * 0.16;
    const segLen = length / FROND_SEGMENTS;
    const leafletLen = 0.06 + rand() * 0.025;

    const segments: Segment[] = [];
    let parent: THREE.Group = tilt;
    for (let j = 0; j < FROND_SEGMENTS; j++) {
      const joint = new THREE.Group();
      parent.add(joint);
      const rachis = new THREE.Mesh(rachisGeo, rachisMat);
      joint.add(rachis);
      const leaflets: THREE.Mesh[] = [];
      for (const side of [0, Math.PI]) {
        const leaflet = new THREE.Mesh(leafletGeo, leafMat);
        leaflet.rotation.y = side;
        joint.add(leaflet);
        leaflets.push(leaflet);
      }
      // Leaflets taper towards the tip.
      segments.push({ joint, rachis, leaflets, size: leafletLen * (1 - (j / FROND_SEGMENTS) * 0.55) });
      parent = joint;
    }
    const tip = new THREE.Mesh(leafletGeo, leafMat);
    // The tip leaflet points straight along the frond (+z turned to +y).
    tip.rotation.x = -Math.PI / 2;
    parent.add(tip);

    fronds.push({
      tilt, pitch: 0.25 + rand() * 0.2, arch: 0.12 + rand() * 0.1, segLen,
      segments, tip, tipSize: leafletLen * 0.6,
    });
  }

  let growth = 1;
  let withered = 0;
  const apply = () => {
    const rise = stage(growth, 0, 0.5);
    const tipOpen = stage(growth, 0.7, 1);
    const w = withered;
    const thick = 0.5 + 0.5 * rise;
    for (const f of fronds) {
      // Young fronds stand nearly upright; withered ones sag outwards.
      f.tilt.rotation.z = -(f.pitch * (0.3 + 0.7 * rise) + w * 0.35);
      let prevLen = 0;
      f.segments.forEach((s, j) => {
        // Base leaflets unfold first, the outer ones later.
        const unfold = stage(growth, 0.3 + j * 0.08, 0.55 + j * 0.08);
        // While curled the outer segments are short, so the coil stays a
        // tight fiddlehead on top of the stalk rather than reaching the ground.
        const len = f.segLen * rise * (j === 0 ? 1 : lerp(0.45, 1, unfold));
        s.joint.position.y = prevLen;
        const curl = j === 0 ? 0 : (1 - unfold) * 0.9;
        s.joint.rotation.z = -(j === 0 ? 0 : f.arch + curl + w * 0.2);
        s.rachis.scale.set(thick, tiny(len), thick);
        for (const l of s.leaflets) {
          l.position.y = len * 0.35;
          l.scale.setScalar(tiny(s.size * unfold * (1 - 0.3 * w)));
          l.rotation.z = w * 0.5; // leaflets fold back as they dry
        }
        prevLen = len;
      });
      f.tip.position.y = prevLen;
      f.tip.scale.setScalar(tiny(f.tipSize * tipOpen * (1 - 0.3 * w)));
    }
    applyColours(shifts, w);
  };

  apply();
  fitHeight(group, body, fullHeight("FERN") * (0.92 + rand() * 0.14));

  return {
    group,
    setGrowth(t) { growth = clamp01(t); apply(); },
    setWithered(v) { withered = clamp01(v); apply(); },
    dispose: disposer(tr),
  };
}

export function buildPlant(species: Species, seed: number, theme: Theme): PlantModel {
  return species === "FERN" ? buildFern(seed, theme) : buildWildflowers(seed, theme);
}

// ---------------------------------------------------------------------------
// Island: a low faceted mound of grass with a darker soil skirt, no water.
//
// The top is flat at y = 0 over the n x n grid plus a small margin, then
// slopes down to an irregular rim about 0.6 beyond the grid; the soil skirt
// runs from the rim down to a narrower base. Faces get slight colour jitter so
// the facets read even under flat light.

const ISLAND_SIDES = 64;

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

  type Ring = THREE.Vector3[];
  const ring = (offset: (i: number) => number, y: (i: number) => number): Ring => {
    const out: Ring = [];
    for (let i = 0; i < ISLAND_SIDES; i++) {
      const a = (i / ISLAND_SIDES) * Math.PI * 2;
      const r = roundedSquareRadius(half, offset(i), a);
      out.push(new THREE.Vector3(Math.cos(a) * r, y(i), Math.sin(a) * r));
    }
    return out;
  };

  // Irregular rim: smooth-ish noise from a few seeded waves plus per-point jitter.
  const waves = [1, 2, 3].map((k) => ({ k: k + 1, amp: rand() * 0.05, ph: rand() * Math.PI * 2 }));
  const wobble = (i: number) => {
    const a = (i / ISLAND_SIDES) * Math.PI * 2;
    return waves.reduce((s, w) => s + w.amp * (1 + Math.sin(w.k * a + w.ph)), 0);
  };
  const jitter = Array.from({ length: ISLAND_SIDES }, () => rand());

  const flat = ring(() => 0.15, () => 0);
  const shoulder = ring((i) => 0.38 + wobble(i) * 0.5, (i) => -0.03 - jitter[i] * 0.02);
  const rim = ring((i) => 0.6 + wobble(i) + jitter[i] * 0.08, (i) => -0.1 - jitter[(i + 7) % ISLAND_SIDES] * 0.04);
  const base = ring((i) => 0.2 + wobble(i) * 0.6, (i) => -0.42 - jitter[(i + 13) % ISLAND_SIDES] * 0.12);
  const centre = new THREE.Vector3(0, 0, 0);
  const bottom = new THREE.Vector3(0, -0.5, 0);

  const grassColour = new THREE.Color(pal.grass);
  const soilColour = new THREE.Color(pal.soil);
  const hsl = { h: 0, s: 0, l: 0 };

  const build = (tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3, number][], base: THREE.Color) => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    base.getHSL(hsl);
    for (const [p, q, r, amount] of tris) {
      pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
      c.setHSL(hsl.h + (rand() - 0.5) * 0.02 * amount, hsl.s, hsl.l * (1 + (rand() - 0.5) * 0.12 * amount));
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return track(tr, g);
  };

  // Wound so faces point up (top) or out and down (skirt) for front-face culling.
  type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3, number];
  const band = (inner: Ring, outer: Ring, amount: number, out: Tri[]) => {
    for (let i = 0; i < ISLAND_SIDES; i++) {
      const j = (i + 1) % ISLAND_SIDES;
      out.push([inner[i], inner[j], outer[i], amount]);
      out.push([inner[j], outer[j], outer[i], amount]);
    }
  };

  const grassTris: Tri[] = [];
  for (let i = 0; i < ISLAND_SIDES; i++) {
    const j = (i + 1) % ISLAND_SIDES;
    grassTris.push([centre, flat[j], flat[i], 0.4]);
  }
  band(flat, shoulder, 1, grassTris);
  band(shoulder, rim, 1, grassTris);

  // From the rim inwards and down to the base: faces point out and down.
  const soilTris: Tri[] = [];
  band(rim, base, 1, soilTris);
  for (let i = 0; i < ISLAND_SIDES; i++) {
    const j = (i + 1) % ISLAND_SIDES;
    soilTris.push([bottom, base[i], base[j], 0.5]);
  }

  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const soilMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  tr.materials.push(grassMat, soilMat);

  const group = new THREE.Group();
  group.name = "island";
  const grass = new THREE.Mesh(build(grassTris, grassColour), grassMat);
  const soil = new THREE.Mesh(build(soilTris, soilColour), soilMat);
  group.add(grass, soil);

  return { group, dispose: disposer(tr) };
}
