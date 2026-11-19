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
import { freeSpots, gridSize, type GrovePlant, type Species, type Spot } from "@/lib/grove/layout";
import { buildIsland, buildPlant, spotToWorld, type PlantModel, type Theme } from "@/lib/grove/models";
import { approach, shownGrowth } from "@/lib/grove/tween";
import type { Outcome } from "@/lib/focus/session";

export type Growing = { species: Species; spot: Spot; progress: number; outcome: Outcome | null };

export type GroveCanvasProps = {
  plants: GrovePlant[];
  growing?: Growing | null;
  pickable?: boolean;
  selectedSpot?: Spot | null;
  onPickSpot?: (spot: Spot) => void;
  label: string;
  onFail: () => void;
};

// ---------------------------------------------------------------------------
// Tunables

const ELEVATION = (38 * Math.PI) / 180; // camera angle above the horizon
const FOV = 30; // vertical, degrees
const FILL = 0.86; // the island may use this much of each half of the view
const GROWTH_HALF_LIFE = 600; // ms
const DROOP_MS = 1500;
const BOUNCE_MS = 400;
const BOUNCE_SCALE = 0.08;
const SWAY_AMPLITUDE = 0.035; // radians, about 2 degrees
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
const DISC: Record<Theme, { colour: number; opacity: number; selected: number }> = {
  light: { colour: 0xffffff, opacity: 0.38, selected: 0.75 },
  dark: { colour: 0xd8f0dc, opacity: 0.2, selected: 0.5 },
};
const SPROUT: Record<Theme, { stem: number; leaf: number }> = {
  light: { stem: 0x5f8f3e, leaf: 0x7cb84f },
  dark: { stem: 0x4f9a35, leaf: 0x66c247 },
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
  id: string; species: Species; x: number; y: number; status: GrovePlant["status"];
  model: PlantModel; sway: Swayer;
};

type GrowingEntry = {
  key: string; spot: Spot; species: Species;
  model: PlantModel; sway: Swayer;
  progress: number; outcome: Outcome | null;
  growth: number; growthTarget: number;
  wither: number; // 0..1 linear, shown eased
  witherTarget: number;
  bounceAt: number | null; // performance.now() when a bounce started
};

/** A tiny two-leaf seedling that marks the chosen spot. */
function buildSprout(theme: Theme) {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const pal = SPROUT[theme];
  const group = new THREE.Group();
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 0.13, 4, 1, true);
  stemGeo.translate(0, 0.065, 0);
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 0.045, 0.02, -0.03, 0.1, 0.035, 0,
    0, 0, 0, 0.1, 0.035, 0, 0.045, 0.02, 0.03,
  ], 3));
  leafGeo.computeVertexNormals();
  geometries.push(stemGeo, leafGeo);
  const stemMat = new THREE.MeshStandardMaterial({ color: pal.stem, flatShading: true, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: pal.leaf, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  materials.push(stemMat, leafMat);
  group.add(new THREE.Mesh(stemGeo, stemMat));
  for (const side of [0, Math.PI]) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 0.12;
    leaf.rotation.set(0, side + 0.4, 0.35);
    group.add(leaf);
  }
  return {
    group,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// Engine

type SyncInput = Pick<GroveCanvasProps, "plants" | "growing" | "pickable" | "selectedSpot">;

function createEngine(wrapper: HTMLDivElement, onFail: () => void, pick: (s: Spot) => void) {
  // Throws when WebGL is unavailable; the caller turns that into onFail.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
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

  // Free-spot discs and the seedling marker.
  const discGeo = new THREE.CircleGeometry(0.3, 20);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const selectedMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  let sprout: ReturnType<typeof buildSprout> | null = null;
  let free = new Set<string>();

  let yaw = -Math.PI / 10;
  let yawTarget = yaw;

  // --- theme ---------------------------------------------------------------
  function applyLights() {
    const l = LIGHTS[theme];
    hemi.color.setHex(l.sky);
    hemi.groundColor.setHex(l.ground);
    hemi.intensity = l.hemi;
    sun.color.setHex(l.sunColour);
    sun.intensity = l.sun;
    const d = DISC[theme];
    discMat.color.setHex(d.colour);
    discMat.opacity = d.opacity;
    selectedMat.color.setHex(d.colour);
    selectedMat.opacity = d.selected;
  }

  // --- framing -------------------------------------------------------------
  // The island turns, so frame the cylinder that holds it at any angle: the
  // corner radius of its rounded-square rim, its soil base, and the tops of
  // the plants on the far side.
  let width = 1;
  let height = 1;
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function frame() {
    if (n === 0) return; // not synced yet
    const half = n / 2;
    const rimR = half * Math.SQRT2 + 0.75;
    const rings: [number, number][] = [
      [rimR, -0.12], [half * Math.SQRT2 + 0.35, -0.55], [half * Math.SQRT2, 0.6],
    ];
    const pts: THREE.Vector3[] = [];
    for (const [r, y] of rings) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    target.set(0, 0, 0);
    const place = (dist: number) => {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    const bounds = () => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        tmp.copy(p).project(camera);
        minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x);
        minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
      }
      return { minX, maxX, minY, maxY };
    };
    // Twice: find the distance, then centre the island vertically and refit.
    for (let pass = 0; pass < 2; pass++) {
      let lo = 1, hi = 400;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        place(mid);
        const b = bounds();
        const fits = (b.maxX - b.minX) / 2 <= FILL && (b.maxY - b.minY) / 2 <= FILL;
        if (fits) hi = mid; else lo = mid;
      }
      place(hi);
      if (pass === 0) {
        const b = bounds();
        const centreY = (b.maxY + b.minY) / 2; // in NDC
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const worldPerNdc = hi * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
        target.addScaledVector(up, centreY * worldPerNdc);
      }
    }
  }

  function resize() {
    const r = wrapper.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    renderer.setSize(width, height, false);
    frame();
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
    // A kept plant on the growing plant's spot (the end screen) is drawn once, as `growing`.
    const plants = next.plants.filter((p) => spotKey(p) !== growingKey);

    const count = plants.length + (g || next.pickable ? 1 : 0);
    const wantN = gridSize(count);
    if (wantN !== n || rebuildAll || !island) {
      const changed = wantN !== n;
      n = wantN;
      rebuildIsland();
      if (changed) frame();
    }

    if (rebuildAll) {
      for (const e of kept.values()) disposeKept(e);
      kept.clear();
      if (growing) {
        // Keep its animation state; rebuild only the model.
        const old = growing;
        plantLayer.remove(old.sway.holder);
        old.model.dispose();
        const model = buildPlant(old.species, hash(old.key), theme);
        old.model = model;
        old.sway = { ...old.sway, holder: holderAt(old.spot, model) };
      }
    }

    // Kept plants.
    const seen = new Set<string>();
    for (const p of plants) {
      seen.add(p.id);
      const e = kept.get(p.id);
      if (e && (e.species !== p.species || e.x !== p.x || e.y !== p.y)) {
        disposeKept(e);
        kept.delete(p.id);
      }
      const cur = kept.get(p.id);
      if (!cur) {
        const seed = hash(p.id);
        const model = buildPlant(p.species, seed, theme);
        model.setGrowth(1);
        model.setWithered(p.status === "WITHERED" ? 1 : 0);
        const holder = holderAt(p, model);
        kept.set(p.id, {
          id: p.id, species: p.species, x: p.x, y: p.y, status: p.status, model,
          sway: { holder, ...swayFor(seed, p.status === "WITHERED") },
        });
      } else if (cur.status !== p.status) {
        cur.status = p.status;
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
      const key = `${g.species}:${g.spot.x},${g.spot.y}`;
      const shown = shownGrowth(g);
      if (!growing || growing.key !== key) {
        // A new plant appears in its current state, without animating in.
        disposeGrowing();
        const seed = hash(key);
        const model = buildPlant(g.species, seed, theme);
        const holder = holderAt(g.spot, model);
        growing = {
          key, spot: { ...g.spot }, species: g.species, model,
          sway: { holder, ...swayFor(seed, false) },
          progress: g.progress, outcome: g.outcome,
          growth: shown.growth, growthTarget: shown.growth,
          wither: shown.withered, witherTarget: shown.withered,
          bounceAt: null,
        };
        applyGrowing();
      } else {
        if (g.outcome !== growing.outcome) {
          if (isKept(g.outcome) && !reduced) growing.bounceAt = performance.now();
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
    while (spotLayer.children.length) spotLayer.remove(spotLayer.children[0]);
    if (sprout) {
      sprout.dispose();
      sprout = null;
    }
    free = new Set();
    if (!input.pickable) return;
    const occupied: Spot[] = [...input.plants];
    if (input.growing) occupied.push(input.growing.spot);
    const sel = input.selectedSpot ? spotKey(input.selectedSpot) : null;
    for (const s of freeSpots(n, occupied)) {
      const k = spotKey(s);
      free.add(k);
      const disc = new THREE.Mesh(discGeo, k === sel ? selectedMat : discMat);
      disc.position.copy(spotToWorld(s)).setY(0.006);
      disc.renderOrder = 1;
      spotLayer.add(disc);
      if (k === sel) {
        sprout = buildSprout(theme);
        sprout.group.position.copy(spotToWorld(s));
        spotLayer.add(sprout.group);
      }
    }
  }

  // --- interaction ---------------------------------------------------------
  let down: { id: number; x: number; y: number; lastX: number; dragging: boolean } | null = null;
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  function pickAt(clientX: number, clientY: number) {
    if (!input.pickable) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(ground, hit)) return;
    root.worldToLocal(hit);
    // Spot {x, y} is centred on world (x + 0.5, y + 0.5).
    const spot = { x: Math.floor(hit.x), y: Math.floor(hit.z) };
    if (free.has(spotKey(spot))) pick(spot);
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
    if (now - lastDraw >= interval - 2) {
      update(now, now - lastUpdate);
      lastUpdate = now;
      renderer.render(scene, camera);
      lastDraw = now;
      dirty = false;
    }
    raf = requestAnimationFrame(loop);
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
      if (sprout) sprout.dispose();
      island?.dispose();
      discGeo.dispose();
      discMat.dispose();
      selectedMat.dispose();
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
  const { plants, growing, pickable, selectedSpot, label } = props;
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
        (s) => latest.current.onPickSpot?.(s),
      );
    } catch {
      latest.current.onFail();
      return;
    }
    engineRef.current = engine;
    const p = latest.current;
    engine.sync({ plants: p.plants, growing: p.growing, pickable: p.pickable, selectedSpot: p.selectedSpot });
    engine.start();
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.sync({ plants, growing, pickable, selectedSpot });
  }, [plants, growing, pickable, selectedSpot]);

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
