"use client";

/**
 * The three.js side of the grove. Only ever loaded through `Grove.tsx` with
 * next/dynamic({ ssr: false }), so three.js stays out of every other bundle.
 *
 * All scene work is imperative and lives in one engine created on mount; prop
 * changes are handed to it through `sync`. It draws only when something is
 * changing (see `loop`).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { canTend, freeSpots, gridSize, spots, type GrovePlant, type Species, type Spot } from "@/lib/grove/layout";
import { buildIsland, buildPlant, spotToWorld, type PlantModel, type Theme } from "@/lib/grove/models";
import { BOUNCE_SCALE, SWAY_AMPLITUDE, plantBounds } from "@/lib/grove/framing";
import { WITHERED_GROWTH, approach, shownGrowth } from "@/lib/grove/tween";
import type { Outcome } from "@/lib/focus/session";

/**
 * The plant a session is growing. `stage` is the stage it grows into (1 for a
 * new plant). A tend sets `tendId` to the saved tree it grows: that tree's
 * resting copy is hidden while this one stands in for it.
 */
export type Growing = {
  species: Species; spot: Spot; stage: number; progress: number; outcome: Outcome | null;
  tendId?: string;
};

export type GroveCanvasProps = {
  plants: GrovePlant[];
  growing?: Growing | null;
  pickable?: boolean;
  selectedSpot?: Spot | null;
  onPickSpot?: (spot: Spot) => void;
  // Rings the trees that can be tended and lets one be chosen. Wins over pickable.
  tendable?: boolean;
  selectedTreeId?: string | null;
  onPickTree?: (plantId: string) => void;
  label: string;
  onFail: () => void;
};

// ---------------------------------------------------------------------------
// Tunables

const ELEVATION = (35 * Math.PI) / 180; // camera angle above the horizon
const FOV = 30; // vertical, degrees
// Framing: at its resting angle the island fills this much of the limiting
// dimension; turned to its widest it may use up to MAX_FILL, never more.
const FILL = 0.9;
const MAX_FILL = 0.98;
const START_YAW = -Math.PI / 10;
const GROWTH_HALF_LIFE = 600; // ms
const DROOP_MS = 1500;
const BOUNCE_MS = 400;
// A kept plant bounces once it has (nearly) finished growing to full size.
const BOUNCE_WHEN_WITHIN = 0.05;
// BOUNCE_SCALE and SWAY_AMPLITUDE live in lib/grove/framing, with plantBounds:
// the height and reach the framing allows for the plants actually present.
const YAW_HALF_LIFE = 120; // ms, for arrow-key turns
const KEY_TURN = Math.PI / 12; // 15 degrees per arrow press
const DRAG_TURN = 0.0105; // radians per pixel
const DRAG_THRESHOLD = 6; // px: more than this between down and up is a drag
const ACTIVE_INTERVAL = 1000 / 30;
const SWAY_INTERVAL = 1000 / 10;
const LOST_CONTEXT_GRACE_MS = 3000;

const LIGHTS: Record<Theme, { sky: number; ground: number; hemi: number; sun: number; sunColour: number }> = {
  light: { sky: 0xcfe4ff, ground: 0x9fbf6a, hemi: 2.1, sun: 2.0, sunColour: 0xfff3dc },
  dark: { sky: 0x8aa2d6, ground: 0x3f6248, hemi: 1.7, sun: 1.6, sunColour: 0xdfe8ff },
};
// Free spots: small, low-contrast rings a little lighter than the grass.
const DISC: Record<Theme, { colour: number; opacity: number }> = {
  light: { colour: 0xe4f7c8, opacity: 0.3 },
  dark: { colour: 0xb9e6a0, opacity: 0.16 },
};
// The selected spot: a soft warm-yellow ring under the seedling. Trees that
// can be tended get the same colour, softer, in a ring wide enough to show
// around the trunk; the chosen tree gets the marker's ring at full strength.
const SELECTED_RING: Record<Theme, { colour: number; opacity: number }> = {
  light: { colour: 0xffd34d, opacity: 0.8 },
  dark: { colour: 0xffcf4a, opacity: 0.65 },
};
// Tend rings: about 0.6 across with a broad band, a little stronger than
// half the selected ring, and lifted clear of the grass.
const TEND_RING = { inner: 0.16, outer: 0.31, lift: 0.02 } as const;
const TEND_RING_SOFTNESS = 0.8; // times SELECTED_RING opacity
const TREE_RING_SCALE = 1.55; // marker ring around a chosen tree: 0.26-0.42, wider than a tend ring
const SPROUT: Record<Theme, { stem: number; leaf: number }> = {
  light: { stem: 0x5a8c38, leaf: 0x7cc04c },
  dark: { stem: 0x55a33a, leaf: 0x74d052 },
};

// ---------------------------------------------------------------------------
// Small helpers

/** FNV-1a, 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const spotKey = (s: Spot) => `${s.x},${s.y}`;
const smooth = (x: number) => x * x * (3 - 2 * x);
const isKept = (o: Outcome | null) => o === "COMPLETED" || o === "CLEARED";
const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

type Swayer = { holder: THREE.Group; phase: number; period: number; amount: number };

function swayFor(seed: number, withered: boolean): Omit<Swayer, "holder"> {
  return {
    phase: ((seed % 1000) / 1000) * Math.PI * 2,
    period: 3500 + (((seed >>> 10) % 1000) / 1000) * 1500,
    amount: withered ? 0.4 : 1,
  };
}

type KeptEntry = {
  id: string; species: Species; x: number; y: number; stage: number; status: GrovePlant["status"];
  model: PlantModel; sway: Swayer;
};

type GrowingEntry = {
  key: string; seed: number; spot: Spot; species: Species; stage: number;
  model: PlantModel; sway: Swayer;
  progress: number; outcome: Outcome | null;
  growth: number; growthTarget: number;
  wither: number; // 0..1 linear, shown eased
  witherTarget: number;
  bounceAt: number | null; // performance.now() when a bounce started
  bouncePending: boolean; // bounce once the growth reaches its target
};

/**
 * The selected-spot marker: a two-leaf seedling standing in a soft warm ring.
 * Built once; `setTheme` only recolours it.
 */
function buildMarker() {
  const group = new THREE.Group();
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.16, 5, 1, true);
  stemGeo.translate(0, 0.08, 0);
  // A broad creased seed leaf along +x.
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 0.06, 0.03, -0.045, 0.065, 0.05, 0,
    0.06, 0.03, -0.045, 0.13, 0.045, 0, 0.065, 0.05, 0,
    0, 0, 0, 0.065, 0.05, 0, 0.06, 0.03, 0.045,
    0.065, 0.05, 0, 0.13, 0.045, 0, 0.06, 0.03, 0.045,
  ], 3));
  leafGeo.computeVertexNormals();
  const ringGeo = new THREE.RingGeometry(0.17, 0.27, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const stemMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const seedling = new THREE.Group();
  seedling.scale.setScalar(1.7); // stands about 0.3 tall, readable at a glance
  seedling.add(new THREE.Mesh(stemGeo, stemMat));
  for (const side of [0, Math.PI]) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 0.15;
    leaf.rotation.set(0, side + 0.5, 0.4);
    seedling.add(leaf);
  }
  group.add(seedling);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.008;
  ring.renderOrder = 2;
  group.add(ring);
  group.visible = false;
  return {
    group,
    /** "seed": the seedling in its ring, on a free spot. "tree": only a wider ring, around a chosen tree. */
    setMode(mode: "seed" | "tree") {
      seedling.visible = mode === "seed";
      ring.scale.setScalar(mode === "tree" ? TREE_RING_SCALE : 1);
      // Lifted like the tend rings, so it reads under a crown.
      ring.position.y = mode === "tree" ? TEND_RING.lift + 0.002 : 0.008;
    },
    setTheme(theme: Theme) {
      stemMat.color.setHex(SPROUT[theme].stem);
      leafMat.color.setHex(SPROUT[theme].leaf);
      ringMat.color.setHex(SELECTED_RING[theme].colour);
      ringMat.opacity = SELECTED_RING[theme].opacity;
    },
    dispose() {
      [stemGeo, leafGeo, ringGeo].forEach((g) => g.dispose());
      [stemMat, leafMat, ringMat].forEach((m) => m.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// Engine

type SyncInput = Pick<GroveCanvasProps, "plants" | "growing" | "pickable" | "selectedSpot" | "tendable" | "selectedTreeId">;

/** Growing plants are keyed by what they grow into; a tree keeps its seed (its look) across stages. */
const plantSeed = (species: Species, s: Spot) => hash(`${species}:${s.x},${s.y}`);
/** A saved plant drawn at rest: full size for its stage, or the withered size (only a sapling withers). */
const restingGrowth = (p: { species: Species; stage: number; status: GrovePlant["status"] }) =>
  p.status === "WITHERED" && !(p.species === "TREE" && p.stage > 1) ? WITHERED_GROWTH : 1;

type Picks = { spot: (s: Spot) => void; tree: (id: string) => void };

function createEngine(wrapper: HTMLDivElement, onFail: () => void, pick: Picks) {
  // Throws when WebGL is unavailable; the caller turns that into onFail.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  try {
    return engineWith(renderer, wrapper, onFail, pick);
  } catch (err) {
    // Don't leak the context or leave a dead canvas behind.
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw err;
  }
}

function engineWith(renderer: THREE.WebGLRenderer, wrapper: HTMLDivElement, onFail: () => void, pick: Picks) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  wrapper.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.position.set(-4, 9, 6); // upper left, towards the viewer
  scene.add(hemi, sun);

  const root = new THREE.Group(); // turned by drag and arrow keys
  scene.add(root);
  const plantLayer = new THREE.Group();
  const spotLayer = new THREE.Group();
  root.add(spotLayer, plantLayer);

  let theme: Theme = currentTheme();
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let disposed = false;

  let island: { group: THREE.Group; dispose(): void } | null = null;
  let n = 0;
  const kept = new Map<string, KeptEntry>();
  let growing: GrowingEntry | null = null;
  let input: SyncInput = { plants: [] };

  // Free-spot rings (one per spot of the current grid, built when the grid
  // size changes, then only shown or hidden) and the selected-spot marker
  // (built once, then only moved).
  const discGeo = new THREE.RingGeometry(0.11, 0.175, 18);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const discs = new Map<string, THREE.Mesh>();
  let discsFor = 0; // grid size the discs were built for
  const marker = buildMarker();
  spotLayer.add(marker.group);
  let free = new Set<string>();
  // Rings around the trees that can be tended (tendable mode), by plant id;
  // all share one geometry and material.
  const tendGeo = new THREE.RingGeometry(TEND_RING.inner, TEND_RING.outer, 28);
  tendGeo.rotateX(-Math.PI / 2);
  const tendMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const tendRings = new Map<string, THREE.Mesh>();
  let tendIds = new Set<string>(); // saved trees that can be tended right now

  let yaw = START_YAW;
  let yawTarget = yaw;

  // --- theme ---------------------------------------------------------------
  function applyLights() {
    const l = LIGHTS[theme];
    hemi.color.setHex(l.sky);
    hemi.groundColor.setHex(l.ground);
    hemi.intensity = l.hemi;
    sun.color.setHex(l.sunColour);
    sun.intensity = l.sun;
    discMat.color.setHex(DISC[theme].colour);
    discMat.opacity = DISC[theme].opacity;
    tendMat.color.setHex(SELECTED_RING[theme].colour);
    tendMat.opacity = SELECTED_RING[theme].opacity * TEND_RING_SOFTNESS;
    marker.setTheme(theme);
  }

  // --- framing -------------------------------------------------------------
  // Frames the real island (its vertices) and the tops of the tallest and
  // widest plants present (plantBounds) at the corners of the planting grid,
  // re-framing only when the grid or those bounds change. Two fits, and the
  // farther camera wins: the island at its resting angle fills FILL of the
  // limiting dimension, and turned to its widest (a circle of its largest
  // radius) it still fits within MAX_FILL. Framing ignores the current turn,
  // so turning never zooms.
  let width = 1;
  let height = 1;
  let room = plantBounds([]); // what the framing allows for, from the plants present
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const rest = new THREE.Matrix4();
  function framePoints() {
    const half = n / 2;
    const resting: THREE.Vector3[] = [];
    let maxR = 0;
    let minY = 0;
    rest.makeRotationY(START_YAW);
    island?.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        maxR = Math.max(maxR, Math.hypot(v.x, v.z));
        minY = Math.min(minY, v.y);
        resting.push(v.applyMatrix4(rest));
      }
    });
    const reach = half - 0.5 + room.reach;
    for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      resting.push(new THREE.Vector3(x * reach, room.top, z * reach).applyMatrix4(rest));
    }
    const widest: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      widest.push(new THREE.Vector3(c * maxR, -0.1, s * maxR));
      widest.push(new THREE.Vector3(c * maxR * 0.8, minY + 0.1, s * maxR * 0.8));
      widest.push(new THREE.Vector3(c * reach * Math.SQRT2, room.top, s * reach * Math.SQRT2));
    }
    return { resting, widest };
  }

  const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const place = (at: THREE.Vector3, dist: number) => {
    camera.position.copy(at).addScaledVector(dir, dist);
    camera.lookAt(at);
    camera.updateMatrixWorld();
  };
  const bounds = (pts: THREE.Vector3[]) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      tmp.copy(p).project(camera);
      minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x);
      minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
    }
    return { minX, maxX, minY, maxY };
  };
  /** Camera distance and look-at point that fit `pts` within `fill`, centred. */
  function fit(pts: THREE.Vector3[], fill: number) {
    const at = new THREE.Vector3();
    let dist = 400;
    for (let pass = 0; pass < 3; pass++) {
      let lo = 0.5, hi = 400;
      for (let k = 0; k < 36; k++) {
        const mid = (lo + hi) / 2;
        place(at, mid);
        const b = bounds(pts);
        const fits = (b.maxX - b.minX) / 2 <= fill && (b.maxY - b.minY) / 2 <= fill;
        if (fits) hi = mid; else lo = mid;
      }
      dist = hi;
      place(at, dist);
      // Centre the projection: shift the look-at point by the NDC offset.
      const b = bounds(pts);
      const t = dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      at.addScaledVector(up, ((b.maxY + b.minY) / 2) * t);
      at.addScaledVector(right, ((b.maxX + b.minX) / 2) * t * camera.aspect);
    }
    return { dist, at };
  }

  function frame() {
    if (n === 0 || !island) return; // not synced yet
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const { resting, widest } = framePoints();
    const a = fit(resting, FILL);
    const b = fit(widest, MAX_FILL);
    const best = a.dist >= b.dist ? a : b;
    target.copy(best.at);
    place(target, best.dist);
  }

  function resize() {
    const r = wrapper.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    renderer.setSize(width, height, false);
    frame();
    // Draw straight away, even before the visibility and intersection
    // observers have reported (a hidden pane never runs rAF).
    drawNow(performance.now());
    invalidate();
  }

  // --- scene reconciliation ------------------------------------------------
  function disposeKept(e: KeptEntry) {
    plantLayer.remove(e.sway.holder);
    e.model.dispose();
  }
  function disposeGrowing() {
    if (!growing) return;
    plantLayer.remove(growing.sway.holder);
    growing.model.dispose();
    growing = null;
  }
  function holderAt(spot: Spot, model: PlantModel) {
    const holder = new THREE.Group();
    holder.position.copy(spotToWorld(spot));
    holder.add(model.group);
    plantLayer.add(holder);
    return holder;
  }

  function rebuildIsland() {
    if (island) {
      root.remove(island.group);
      island.dispose();
    }
    island = buildIsland(n, theme);
    root.add(island.group);
  }

  function sync(next: SyncInput, rebuildAll = false) {
    input = next;
    const g = next.growing ?? null;
    const growingKey = g ? spotKey(g.spot) : null;
    // A kept plant on the growing plant's spot (the end screen), or the tree a
    // tend is growing, is drawn once, as `growing`.
    const plants = next.plants.filter((p) => spotKey(p) !== growingKey && !(g?.tendId && p.id === g.tendId));

    const count = plants.length + (g || (next.pickable && !next.tendable) ? 1 : 0);
    const wantN = gridSize(count);
    // Re-frame only when the grid or the tallest/widest plant changes (a new
    // plant, a tree reaching a new stage), never as a plant grows.
    let reframe = false;
    if (wantN !== n || rebuildAll || !island) {
      reframe = wantN !== n;
      n = wantN;
      rebuildIsland();
    }
    const wantRoom = plantBounds(g ? [...plants, g] : plants);
    if (wantRoom.top !== room.top || wantRoom.reach !== room.reach) {
      room = wantRoom;
      reframe = true;
    }
    if (reframe) frame();

    if (rebuildAll) {
      for (const e of kept.values()) disposeKept(e);
      kept.clear();
      if (growing) {
        // Keep its animation state; rebuild only the model.
        const old = growing;
        plantLayer.remove(old.sway.holder);
        old.model.dispose();
        const model = buildPlant(old.species, old.seed, theme, old.stage);
        old.model = model;
        old.sway = { ...old.sway, holder: holderAt(old.spot, model) };
      }
    }

    // Kept plants.
    const seen = new Set<string>();
    for (const p of plants) {
      seen.add(p.id);
      const e = kept.get(p.id);
      // A new stage is a new model (only that one rebuilds).
      if (e && (e.species !== p.species || e.x !== p.x || e.y !== p.y || e.stage !== p.stage)) {
        disposeKept(e);
        kept.delete(p.id);
      }
      const cur = kept.get(p.id);
      if (!cur) {
        // Same seed as the growing plant, so a saved plant keeps the look it grew with.
        const seed = plantSeed(p.species, p);
        const model = buildPlant(p.species, seed, theme, p.stage);
        model.setGrowth(restingGrowth(p));
        model.setWithered(p.status === "WITHERED" ? 1 : 0);
        const holder = holderAt(p, model);
        kept.set(p.id, {
          id: p.id, species: p.species, x: p.x, y: p.y, stage: p.stage, status: p.status, model,
          sway: { holder, ...swayFor(seed, p.status === "WITHERED") },
        });
      } else if (cur.status !== p.status) {
        cur.status = p.status;
        cur.model.setGrowth(restingGrowth(p));
        cur.model.setWithered(p.status === "WITHERED" ? 1 : 0);
        cur.sway.amount = p.status === "WITHERED" ? 0.4 : 1;
      }
    }
    for (const [id, e] of kept) {
      if (!seen.has(id)) {
        disposeKept(e);
        kept.delete(id);
      }
    }

    // The growing plant.
    if (!g) {
      disposeGrowing();
    } else {
      // The stage is in the key, so growing into a new stage is a new model;
      // it is not in the seed, so a tree keeps its look.
      const key = `${g.species}:${g.spot.x},${g.spot.y}:${g.stage}`;
      const tend = Boolean(g.tendId);
      const shown = shownGrowth({ progress: g.progress, outcome: g.outcome, tend });
      if (!growing || growing.key !== key) {
        // A new plant appears in its current state, without animating in.
        // One created with an outcome already set (the end screen replaces the
        // session screen) starts from the session's state and plays the end:
        // a kept plant grows the rest of the way and bounces, a lost one droops
        // (a lost tend shrinks back to the tree's old stage instead).
        disposeGrowing();
        const seed = plantSeed(g.species, g.spot);
        const model = buildPlant(g.species, seed, theme, g.stage);
        const holder = holderAt(g.spot, model);
        const ending = g.outcome !== null && !reduced;
        growing = {
          key, seed, spot: { ...g.spot }, species: g.species, stage: g.stage, model,
          sway: { holder, ...swayFor(seed, false) },
          progress: g.progress, outcome: g.outcome,
          growth: ending ? g.progress : shown.growth, growthTarget: shown.growth,
          wither: ending ? 0 : shown.withered, witherTarget: shown.withered,
          bounceAt: null,
          bouncePending: ending && isKept(g.outcome),
        };
        applyGrowing();
      } else {
        if (g.outcome !== growing.outcome) {
          if (isKept(g.outcome) && !reduced) growing.bouncePending = true;
          growing.outcome = g.outcome;
        }
        growing.progress = g.progress;
        growing.growthTarget = shown.growth;
        growing.witherTarget = shown.withered;
        if (reduced) {
          growing.growth = shown.growth;
          growing.wither = shown.withered;
        }
        applyGrowing();
      }
    }

    syncSpots();
    invalidate();
  }

  function applyGrowing() {
    if (!growing) return;
    growing.model.setGrowth(growing.growth);
    growing.model.setWithered(smooth(growing.wither));
    growing.sway.amount = growing.wither > 0.5 ? 0.4 : 1;
  }

  function syncSpots() {
    if (discsFor !== n) {
      // New grid size: one ring per spot, all sharing a geometry and material.
      for (const d of discs.values()) spotLayer.remove(d);
      discs.clear();
      for (const s of spots(n)) {
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.copy(spotToWorld(s)).setY(0.006);
        disc.renderOrder = 1;
        disc.visible = false;
        spotLayer.add(disc);
        discs.set(spotKey(s), disc);
      }
      discsFor = n;
    }
    free = new Set();
    const tendable = Boolean(input.tendable);
    if (input.pickable && !tendable) {
      const occupied: Spot[] = [...input.plants];
      if (input.growing) occupied.push(input.growing.spot);
      for (const s of freeSpots(n, occupied)) free.add(spotKey(s));
    }
    const sel = input.selectedSpot ? spotKey(input.selectedSpot) : null;
    for (const [k, d] of discs) d.visible = free.has(k) && k !== sel;

    // Tendable trees: only those drawn at rest (not one a tend is growing).
    tendIds = new Set();
    if (tendable) {
      for (const p of input.plants) if (canTend(p) && kept.has(p.id)) tendIds.add(p.id);
    }
    const selTree = tendable && input.selectedTreeId && tendIds.has(input.selectedTreeId)
      ? kept.get(input.selectedTreeId)!
      : null;
    for (const [id, r] of tendRings) {
      if (!tendIds.has(id)) {
        spotLayer.remove(r);
        tendRings.delete(id);
      }
    }
    for (const id of tendIds) {
      let r = tendRings.get(id);
      if (!r) {
        r = new THREE.Mesh(tendGeo, tendMat);
        r.renderOrder = 1;
        spotLayer.add(r);
        tendRings.set(id, r);
      }
      const e = kept.get(id)!;
      r.position.copy(spotToWorld(e)).setY(TEND_RING.lift);
      r.visible = e !== selTree;
    }

    if (selTree) {
      marker.setMode("tree");
      marker.group.visible = true;
      marker.group.position.copy(spotToWorld(selTree));
    } else {
      marker.setMode("seed");
      marker.group.visible = sel !== null && free.has(sel);
      if (marker.group.visible && input.selectedSpot) marker.group.position.copy(spotToWorld(input.selectedSpot));
    }
  }

  // --- interaction ---------------------------------------------------------
  let down: { id: number; x: number; y: number; lastX: number; dragging: boolean } | null = null;
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  function pickAt(clientX: number, clientY: number) {
    const tending = Boolean(input.tendable);
    if (!input.pickable && !tending) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (tending) {
      // A tap on a tree itself (its crown stands well above its spot) wins.
      const holders: THREE.Object3D[] = [];
      const owner = new Map<THREE.Object3D, string>();
      for (const id of tendIds) {
        const h = kept.get(id)!.sway.holder;
        holders.push(h);
        owner.set(h, id);
      }
      for (const x of raycaster.intersectObjects(holders, true)) {
        let o: THREE.Object3D | null = x.object;
        while (o && !owner.has(o)) o = o.parent;
        if (o) {
          pick.tree(owner.get(o)!);
          return;
        }
      }
    }
    if (!raycaster.ray.intersectPlane(ground, hit)) return;
    root.worldToLocal(hit);
    // Spot {x, y} is centred on world (x + 0.5, y + 0.5).
    const spot = { x: Math.floor(hit.x), y: Math.floor(hit.z) };
    if (tending) {
      for (const id of tendIds) {
        const e = kept.get(id)!;
        if (e.x === spot.x && e.y === spot.y) {
          pick.tree(id);
          return;
        }
      }
    } else if (free.has(spotKey(spot))) pick.spot(spot);
  }

  function onPointerDown(e: PointerEvent) {
    if (down || (e.pointerType === "mouse" && e.button !== 0)) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, dragging: false };
  }
  function onPointerMove(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    if (!down.dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD) {
      down.dragging = true;
      down.lastX = e.clientX;
      try { wrapper.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      wrapper.style.cursor = "grabbing";
    }
    if (down.dragging) {
      yaw += (e.clientX - down.lastX) * DRAG_TURN;
      yawTarget = yaw;
      down.lastX = e.clientX;
      invalidate();
    }
  }
  function onPointerUp(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    const wasDrag = down.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD;
    down = null;
    wrapper.style.cursor = "";
    if (!wasDrag) pickAt(e.clientX, e.clientY);
  }
  function onPointerCancel(e: PointerEvent) {
    // The browser took over (e.g. a vertical page scroll on touch).
    if (down && e.pointerId === down.id) {
      down = null;
      wrapper.style.cursor = "";
    }
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    yawTarget += e.key === "ArrowLeft" ? -KEY_TURN : KEY_TURN;
    if (reduced) yaw = yawTarget;
    invalidate();
  }

  // --- the loop ------------------------------------------------------------
  // requestAnimationFrame runs only while there is something to draw. Each
  // frame it decides the rate it needs: 30 fps while anything is actually
  // moving (a tween, a bounce, a drag, an arrow-key turn) or a change is
  // waiting to be drawn; 10 fps when only the idle sway is moving; none at
  // all otherwise (always the case under reduced motion once settled). It
  // stops entirely while the page is hidden or the canvas is off-screen.
  let raf = 0;
  let lastDraw = -Infinity;
  let lastUpdate = performance.now();
  let dirty = true;
  let pageVisible = !document.hidden;
  let onScreen = true;
  let contextLost = false;

  const runnable = () => !disposed && pageVisible && onScreen && !contextLost;

  function animating(now: number) {
    if (down?.dragging) return true;
    if (Math.abs(yaw - yawTarget) > 1e-4) return true;
    if (growing) {
      if (growing.growth !== growing.growthTarget || growing.wither !== growing.witherTarget) return true;
      if (growing.bouncePending) return true;
      if (growing.bounceAt !== null && now - growing.bounceAt < BOUNCE_MS) return true;
    }
    return false;
  }
  const swaying = () => !reduced && (kept.size > 0 || growing !== null);

  function update(now: number, dt: number) {
    yaw = reduced ? yawTarget : approach(yaw, yawTarget, dt, YAW_HALF_LIFE);
    if (Math.abs(yaw - yawTarget) <= 1e-4) yaw = yawTarget;
    root.rotation.y = yaw;

    if (growing) {
      const gr = growing;
      const snap = reduced || dt > 2000;
      gr.growth = snap ? gr.growthTarget : approach(gr.growth, gr.growthTarget, dt, GROWTH_HALF_LIFE);
      if (snap) gr.wither = gr.witherTarget;
      else {
        const step = dt / DROOP_MS;
        gr.wither = gr.wither < gr.witherTarget
          ? Math.min(gr.witherTarget, gr.wither + step)
          : Math.max(gr.witherTarget, gr.wither - step);
      }
      applyGrowing();
      if (gr.bouncePending) {
        // No bounce under reduced motion or after a long pause (it snapped).
        if (snap) gr.bouncePending = false;
        else if (Math.abs(gr.growthTarget - gr.growth) <= BOUNCE_WHEN_WITHIN) {
          gr.bouncePending = false;
          gr.bounceAt = now;
        }
      }
      let scale = 1;
      if (gr.bounceAt !== null) {
        const t = (now - gr.bounceAt) / BOUNCE_MS;
        if (t >= 1 || reduced) gr.bounceAt = null;
        else scale = 1 + BOUNCE_SCALE * Math.sin(Math.PI * t);
      }
      gr.sway.holder.scale.setScalar(scale);
    }

    const sway = (s: Swayer) => {
      if (reduced) {
        s.holder.rotation.set(0, 0, 0);
        return;
      }
      const a = SWAY_AMPLITUDE * s.amount;
      const w = ((now / s.period) * Math.PI * 2) + s.phase;
      s.holder.rotation.set(a * 0.6 * Math.sin(w * 0.77 + s.phase * 1.7), 0, a * Math.sin(w));
    };
    for (const e of kept.values()) sway(e.sway);
    if (growing) sway(growing.sway);
  }

  function loop(now: number) {
    raf = 0;
    if (!runnable()) return; // resumed by the visibility / intersection handlers
    const busy = animating(now) || dirty;
    const interval = busy ? ACTIVE_INTERVAL : swaying() ? SWAY_INTERVAL : Infinity;
    if (interval === Infinity) return; // nothing changes; invalidate() restarts
    if (now - lastDraw >= interval - 2) drawNow(now);
    raf = requestAnimationFrame(loop);
  }

  function drawNow(now: number) {
    if (disposed || contextLost) return;
    update(now, now - lastUpdate);
    lastUpdate = now;
    renderer.render(scene, camera);
    lastDraw = now;
    dirty = false;
  }

  /** Something changed: make sure a frame is coming. */
  function invalidate() {
    dirty = true;
    wake(false);
  }
  /**
   * Start the loop if it is stopped. After an idle stop the next tween step
   * starts fresh; after the page was hidden or off-screen the elapsed time is
   * kept, so a long gap snaps instead of replaying.
   */
  function wake(keepElapsed: boolean) {
    if (raf || !runnable()) return;
    if (!keepElapsed) lastUpdate = Math.max(lastUpdate, performance.now() - ACTIVE_INTERVAL);
    raf = requestAnimationFrame(loop);
  }

  // --- observers and listeners ----------------------------------------------
  const onVisibility = () => {
    pageVisible = !document.hidden;
    if (pageVisible) {
      dirty = true;
      wake(true);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const io = new IntersectionObserver((entries) => {
    const was = onScreen;
    onScreen = entries.some((en) => en.isIntersecting);
    if (onScreen && !was) {
      dirty = true;
      wake(true);
    }
  });
  io.observe(wrapper);

  const ro = new ResizeObserver(() => resize());
  ro.observe(wrapper);

  const mo = new MutationObserver(() => {
    const t = currentTheme();
    if (t === theme) return;
    theme = t;
    applyLights();
    sync(input, true);
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onMotion = () => {
    reduced = mq.matches;
    if (growing && reduced) {
      growing.growth = growing.growthTarget;
      growing.wither = growing.witherTarget;
      growing.bounceAt = null;
      growing.bouncePending = false;
    }
    invalidate();
  };
  mq.addEventListener("change", onMotion);

  let lostTimer: ReturnType<typeof setTimeout> | null = null;
  const onLost = (e: Event) => {
    e.preventDefault(); // allow a restore
    contextLost = true;
    lostTimer = setTimeout(() => { if (contextLost && !disposed) onFail(); }, LOST_CONTEXT_GRACE_MS);
  };
  const onRestored = () => {
    contextLost = false;
    if (lostTimer) clearTimeout(lostTimer);
    lostTimer = null;
    invalidate();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  wrapper.addEventListener("pointerdown", onPointerDown);
  wrapper.addEventListener("pointermove", onPointerMove);
  wrapper.addEventListener("pointerup", onPointerUp);
  wrapper.addEventListener("pointercancel", onPointerCancel);
  wrapper.addEventListener("keydown", onKeyDown);

  applyLights();
  root.rotation.y = yaw;

  return {
    sync: (next: SyncInput) => sync(next),
    start() {
      resize();
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (lostTimer) clearTimeout(lostTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      mq.removeEventListener("change", onMotion);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      wrapper.removeEventListener("pointerdown", onPointerDown);
      wrapper.removeEventListener("pointermove", onPointerMove);
      wrapper.removeEventListener("pointerup", onPointerUp);
      wrapper.removeEventListener("pointercancel", onPointerCancel);
      wrapper.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);

      for (const e of kept.values()) e.model.dispose();
      kept.clear();
      disposeGrowing();
      marker.dispose();
      island?.dispose();
      discGeo.dispose();
      discMat.dispose();
      tendRings.clear();
      tendGeo.dispose();
      tendMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the GL context now, not at GC
      canvas.remove();
    },
  };
}

type Engine = ReturnType<typeof createEngine>;

// ---------------------------------------------------------------------------
// Component

export default function GroveCanvas(props: GroveCanvasProps) {
  const { plants, growing, pickable, selectedSpot, tendable, selectedTreeId, label } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let engine: Engine;
    try {
      engine = createEngine(
        wrapper,
        () => latest.current.onFail(),
        {
          spot: (s) => latest.current.onPickSpot?.(s),
          tree: (id) => latest.current.onPickTree?.(id),
        },
      );
    } catch {
      latest.current.onFail();
      return;
    }
    engineRef.current = engine;
    const p = latest.current;
    engine.sync({
      plants: p.plants, growing: p.growing, pickable: p.pickable, selectedSpot: p.selectedSpot,
      tendable: p.tendable, selectedTreeId: p.selectedTreeId,
    });
    engine.start();
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.sync({ plants, growing, pickable, selectedSpot, tendable, selectedTreeId });
  }, [plants, growing, pickable, selectedSpot, tendable, selectedTreeId]);

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label={label}
      tabIndex={0}
      // Same focus ring as the Focus page's buttons.
      className="absolute inset-0 cursor-grab select-none rounded-xl outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
      style={{ touchAction: "pan-y", WebkitTapHighlightColor: "transparent" }}
    />
  );
}
