/**
 * The grove's animals, built in code with three.js: butterflies, bees, birds
 * and squirrels, in the same flat-shaded low-poly style as the plants.
 *
 * Plain geometry and materials (no renderer, no DOM), so it runs in Vitest's
 * node environment. All randomness comes from mulberry32(seed).
 *
 * Motion is a pure function of time and seed. `update(timeMs)` works the pose
 * out from closed-form periodic functions (sums of sines, and a seeded
 * schedule that repeats every few seconds: the butterfly's rest, the bee's
 * visits, the bird's trip to the ground, the squirrel's runs), never by
 * stepping state forward, so after a long hidden gap the next call simply
 * lands on the right pose. `update` only writes numbers into objects made at
 * build time; it allocates nothing. `update(0)` is always a resting pose
 * (sitting, wings folded or half-open), which is what reduced motion shows.
 *
 * Each animal's `group` is placed at its home on the ground; everything moves
 * inside it. Budgets: at most about 120 triangles per animal.
 *
 * Bounds, which the tests check over two minutes for many seeds: every vertex
 * stays within `home.radius` of the home horizontally (the bird's trip to the
 * ground within `radius + 0.6`), never below `groundY - 0.01`, never above
 * `perchY + 0.5`.
 */
import * as THREE from "three";
import type { AnimalKind } from "./habitat";
import { disposer, fromTriangles, lumpGeometry, material, mulberry32, track, type Theme, type Tracker } from "./models";

/** Where an animal lives, in world units; perchY is the canopy or bloom top it sits on. */
export type Home = { x: number; z: number; groundY: number; perchY: number; radius: number };
export type AnimalModel = {
  group: THREE.Group;
  update(timeMs: number): void; // pure function of time: same time, same pose; allocation-free
  setTheme(theme: Theme): void;
  dispose(): void;
};

/** How often the caller needs to call `update`: the motion reads well at 20 frames a second. */
export const ANIMAL_FPS = 20;

// ---------------------------------------------------------------------------
// Colours. Every opaque colour sits well away from the island grass in both
// themes (light 0x93c768, dark 0x5a8f3c): at least 0.25 apart in RGB, the
// same "stands out from the grass" rule the plants follow. Dark-theme colours
// are a little brighter, as the plants' are.

type Pair = readonly [light: number, dark: number];
const BUTTERFLY_WINGS: readonly (readonly [fore: Pair, hind: Pair])[] = [
  [[0xf0821e, 0xff9a38], [0xd8661a, 0xf07e28]], // orange
  [[0xf5d21e, 0xffe040], [0xe0a818, 0xffc828]], // yellow
  [[0x4aa0ec, 0x6cbcff], [0x3a86d6, 0x52a2f4]], // sky blue
  [[0xf07aae, 0xff8ec4], [0xd85e94, 0xf272aa]], // pink
];
const BUTTERFLY_BODY: Pair = [0x3a2c24, 0x2e241e];
const BEE_YELLOW: Pair = [0xf2c230, 0xffd23f];
const BEE_BLACK: Pair = [0x2a2420, 0x2a2420];
type BirdTones = { back: Pair; breast: Pair; wing: Pair; head: Pair };
const BIRDS: readonly BirdTones[] = [
  // robin: grey-brown back, dark head, red-orange breast
  { back: [0x6e625a, 0x8a7c72], breast: [0xd9622f, 0xf07048], wing: [0x5e534c, 0x5a4a40], head: [0x4a423e, 0x3e3632] },
  // sparrow: warm brown, pale buff breast
  { back: [0x8a6038, 0xa87448], breast: [0xe2d2b0, 0xf0e2c4], wing: [0x6e4a2c, 0x8a5c38], head: [0x7a5a40, 0x9a6e4c] },
  // bluebird: blue back, rusty breast
  { back: [0x3f74c4, 0x5a92ec], breast: [0xd88548, 0xf09a5a], wing: [0x335fa6, 0x4a7fd6], head: [0x3f74c4, 0x5a92ec] },
];
const BEAK: Pair = [0xe0a030, 0xf0b440];
const SQUIRREL = {
  body: [0xa8522a, 0xc4653a] as Pair,
  belly: [0xf0dcbc, 0xf5e4c8] as Pair,
  tail: [0xb85e30, 0xd4743e] as Pair,
  ear: [0x8e4424, 0xa85430] as Pair,
};

// ---------------------------------------------------------------------------
// Helpers

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** t mod p, always in [0, p). */
const wrap = (t: number, p: number) => ((t % p) + p) % p;
/** From angle a towards b by t, the short way round. */
const lerpAngle = (a: number, b: number, t: number) => a + (wrap(b - a + Math.PI, TAU) - Math.PI) * t;
/** Facing for a step along (dx, dz), with +z as the animal's forward. */
const facing = (dx: number, dz: number) => Math.atan2(dx, dz);

type Painted = { mat: THREE.MeshStandardMaterial; pair: Pair };
type Kit = { tr: Tracker; paints: Painted[]; theme: Theme };
function paint(kit: Kit, pair: Pair, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const mat = material(kit.tr, pair[kit.theme === "light" ? 0 : 1], opts);
  kit.paints.push({ mat, pair });
  return mat;
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, name = "") {
  const m = new THREE.Mesh(geometry, mat);
  m.name = name;
  parent.add(m);
  return m;
}
/** A closed low-poly cylinder (or cone, when `top` is 0) lying along z, centred on the origin. */
function rod(tr: Tracker, top: number, bottom: number, length: number, sides: number, open = false) {
  const g = new THREE.CylinderGeometry(top, bottom, length, sides, 1, open);
  g.rotateX(Math.PI / 2); // +y (top) becomes +z
  return track(tr, g);
}
function octa(tr: Tracker, r: number) {
  return track(tr, new THREE.OctahedronGeometry(r, 0));
}
/** A flat polygon from a fan of points in the xz plane; mirrored in x when `flip`. */
function fan(tr: Tracker, pts: readonly (readonly [number, number])[], flip: boolean) {
  const s = flip ? -1 : 1, out: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    for (const p of [pts[0], pts[i], pts[i + 1]]) out.push(s * p[0], 0, p[1]);
  }
  return fromTriangles(tr, out);
}

function finish(group: THREE.Group, kit: Kit, update: (t: number) => void): AnimalModel {
  update(0);
  const dispose = disposer(kit.tr);
  return {
    group,
    update(timeMs: number) { update(Number.isFinite(timeMs) ? timeMs / 1000 : 0); },
    setTheme(theme: Theme) { for (const p of kit.paints) p.mat.color.setHex(p.pair[theme === "light" ? 0 : 1]); },
    dispose,
  };
}

/** A seeded point within `r` of the centre, on a uniform disc. */
function discPoint(rand: () => number, r: number): [number, number] {
  const a = rand() * TAU, d = r * Math.sqrt(rand());
  return [d * Math.cos(a), d * Math.sin(a)];
}

// ---------------------------------------------------------------------------
// Butterfly: a slim dark body and two pairs of flat faceted wings, 0.12 across.
//
// It loops lazily around its home (a circle of 0.25-0.4, kept inside the
// home's radius) at 0.3-0.65 above the ground, flapping six times a second.
// Each seeded cycle of 14-22 s it starts by resting on a bloom (at perchY)
// for 3-5 s, wings upright and slowly opening and closing, then lifts off,
// loops, and drifts back down to the bloom. About 32 triangles.

const BUTTERFLY_REACH = 0.075; // furthest any vertex gets from the body's origin
const FLAP_HZ = 6;

function buildButterfly(seed: number, theme: Theme, home: Home, group: THREE.Group): AnimalModel {
  const rand = mulberry32(seed);
  const kit: Kit = { tr: { geometries: [], materials: [] }, paints: [], theme };
  const [fore, hind] = BUTTERFLY_WINGS[Math.floor(rand() * BUTTERFLY_WINGS.length)];
  const bodyMat = paint(kit, BUTTERFLY_BODY);
  const foreMat = paint(kit, fore, { side: THREE.DoubleSide });
  const hindMat = paint(kit, hind, { side: THREE.DoubleSide });

  const root = new THREE.Group();
  group.add(root);
  const body = mesh(root, rod(kit.tr, 0.004, 0.006, 0.05, 4), bodyMat, "body");
  body.position.set(0, 0.007, -0.004);
  const head = mesh(root, octa(kit.tr, 0.007), bodyMat, "head");
  head.position.set(0, 0.008, 0.026);
  // Two antennae as thin slivers.
  const feelers = fromTriangles(kit.tr, [
    0.002, 0.012, 0.03, 0.012, 0.03, 0.048, 0.003, 0.011, 0.03,
    -0.002, 0.012, 0.03, -0.003, 0.011, 0.03, -0.012, 0.03, 0.048,
  ]);
  mesh(root, feelers, bodyMat, "feelers");
  const FORE = [[0.003, 0.004], [0.003, 0.016], [0.045, 0.034], [0.06, 0.012], [0.04, -0.004]] as const;
  const HIND = [[0.003, -0.002], [0.04, -0.006], [0.035, -0.03], [0.012, -0.032]] as const;
  const wings: THREE.Group[] = [];
  for (const flip of [false, true]) {
    const w = new THREE.Group();
    w.name = flip ? "wingL" : "wingR";
    w.position.set(0, 0.009, 0);
    mesh(w, fan(kit.tr, FORE, flip), foreMat);
    mesh(w, fan(kit.tr, HIND, flip), hindMat);
    root.add(w);
    wings.push(w);
  }
  const [wingR, wingL] = wings;

  const loopR = Math.max(0.05, Math.min(0.25 + 0.15 * rand(), home.radius - BUTTERFLY_REACH - 0.025));
  const wobble = 0.02;
  const omega = (rand() < 0.5 ? -1 : 1) * TAU / (6 + 3 * rand()); // one lap every 6-9 s
  const phase0 = rand() * TAU;
  const top = Math.min(0.65, home.perchY - home.groundY + 0.5 - BUTTERFLY_REACH - 0.02);
  const midY = Math.min(0.3 + 0.3 * rand(), top - 0.1);
  const bob = Math.max(0, Math.min(0.08, top - midY - 0.01, midY - 0.25));
  const bobHz = 0.31 + 0.2 * rand();
  const period = 14 + 8 * rand();
  const rest = 3 + 2 * rand();
  const glide = 1.2;
  const [landX, landZ] = discPoint(rand, Math.max(0, home.radius - BUTTERFLY_REACH - 0.03) * 0.6);
  const landY = home.perchY - home.groundY;
  const restYaw = rand() * TAU;
  group.position.set(home.x, home.groundY, home.z);

  return finish(group, kit, (t) => {
    const p = wrap(t, period);
    // How much it is resting on the bloom: 1 while resting, gliding off and back.
    const b = p < rest ? 1 : p < rest + glide ? 1 - smooth((p - rest) / glide) : p > period - glide ? smooth((p - (period - glide)) / glide) : 0;
    const th = phase0 + omega * t;
    const rr = loopR + wobble * Math.sin(t * 1.7 + phase0);
    const fx = rr * Math.cos(th), fz = rr * Math.sin(th);
    const fy = midY + bob * Math.sin(TAU * bobHz * t);
    root.position.set(lerp(fx, landX, b), lerp(fy, landY, b), lerp(fz, landZ, b));
    const flyYaw = facing(-Math.sin(th) * omega, Math.cos(th) * omega);
    root.rotation.y = lerpAngle(flyYaw, restYaw, b);
    // Wing angle above flat: flapping in flight, upright and slowly opening at rest.
    const flapA = 0.45 + 0.75 * Math.sin(TAU * FLAP_HZ * t);
    const restA = 1.35 - 0.75 * (0.5 - 0.5 * Math.cos(TAU * t / 3.2));
    const a = lerp(flapA, restA, b);
    wingR.rotation.z = a;
    wingL.rotation.z = -a;
  });
}

// ---------------------------------------------------------------------------
// Bee: a small striped body (yellow and near-black bands, about 0.065 long)
// with two tiny see-through wings.
//
// It visits three bloom tops within its home, sitting 1.5-3.5 s on each and
// darting to the next in half a second with a little hop; in flight its
// wings buzz, drawn as a fast scale flicker (27 Hz, so at 20 frames a second
// it reads as a shimmer, not a smooth beat). About 70 triangles.

const BEE_REACH = 0.04;
const BEE_STOPS = 3;
const DART = 0.5;

function buildBee(seed: number, theme: Theme, home: Home, group: THREE.Group): AnimalModel {
  const rand = mulberry32(seed);
  const kit: Kit = { tr: { geometries: [], materials: [] }, paints: [], theme };
  const yellow = paint(kit, BEE_YELLOW);
  const black = paint(kit, BEE_BLACK);
  const wingMat = material(kit.tr, 0xffffff, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });

  const root = new THREE.Group();
  group.add(root);
  const r = 0.011, y0 = 0.012;
  const sting = mesh(root, rod(kit.tr, 0, r * 0.85, 0.012, 6, true), black, "sting");
  sting.position.set(0, y0, -0.03);
  sting.rotation.y = Math.PI; // point the tip backwards
  const bands = [yellow, black, yellow];
  bands.forEach((m, i) => { const band = mesh(root, rod(kit.tr, r, r, 0.012, 6, true), m, "band"); band.position.set(0, y0, -0.018 + 0.012 * i); });
  const thorax = mesh(root, octa(kit.tr, 0.011), black, "thorax");
  thorax.position.set(0, y0 + 0.001, 0.017);
  const head = mesh(root, octa(kit.tr, 0.008), black, "head");
  head.position.set(0, y0 + 0.002, 0.031);
  const WING = [[0.001, 0.006], [0.024, -0.002], [0.022, -0.016], [0.001, -0.004]] as const;
  const wings: THREE.Group[] = [];
  for (const flip of [false, true]) {
    const w = new THREE.Group();
    w.name = flip ? "wingL" : "wingR";
    w.position.set(flip ? -0.004 : 0.004, y0 + 0.011, 0.016);
    mesh(w, fan(kit.tr, WING, flip), wingMat);
    root.add(w);
    wings.push(w);
  }
  const [wingR, wingL] = wings;

  // Three stops, spread round the home, at bloom tops just under perchY.
  const stopX: number[] = [], stopZ: number[] = [], stopY: number[] = [], sit: number[] = [], yaw: number[] = [];
  const spread = Math.max(0, home.radius - BEE_REACH - 0.02);
  const a0 = rand() * TAU;
  for (let i = 0; i < BEE_STOPS; i++) {
    const a = a0 + (i * TAU) / BEE_STOPS + (rand() - 0.5) * 0.8, d = spread * (0.35 + 0.65 * rand());
    stopX.push(d * Math.cos(a)); stopZ.push(d * Math.sin(a));
    stopY.push(home.perchY - home.groundY - (i === 0 ? 0 : 0.012 * rand()));
    sit.push(1.5 + 2 * rand());
  }
  for (let i = 0; i < BEE_STOPS; i++) {
    const j = (i + 1) % BEE_STOPS;
    yaw.push(facing(stopX[j] - stopX[i], stopZ[j] - stopZ[i])); // leaving stop i
  }
  let cycle = 0;
  for (const s of sit) cycle += s + DART;
  const hop = 0.06; // well under the perchY + 0.5 ceiling
  group.position.set(home.x, home.groundY, home.z);

  return finish(group, kit, (t) => {
    let p = wrap(t, cycle), i = 0;
    while (i < BEE_STOPS - 1 && p >= sit[i] + DART) { p -= sit[i] + DART; i++; }
    const j = (i + 1) % BEE_STOPS;
    const arrived = yaw[(i + BEE_STOPS - 1) % BEE_STOPS];
    let flying = 0;
    if (p < sit[i]) {
      root.position.set(stopX[i], stopY[i], stopZ[i]);
      // Turns about a little on the flower.
      root.rotation.y = arrived + 0.4 * Math.sin(TAU * p / 2.5);
    } else {
      const u = (p - sit[i]) / DART, s = smooth(u);
      flying = Math.sin(Math.PI * u);
      root.position.set(lerp(stopX[i], stopX[j], s), lerp(stopY[i], stopY[j], s) + hop * flying, lerp(stopZ[i], stopZ[j], s));
      const sitYaw = arrived + 0.4 * Math.sin(TAU * sit[i] / 2.5);
      root.rotation.y = lerpAngle(sitYaw, yaw[i], smooth(u * 3));
    }
    const buzz = flying > 0 ? 1 + 0.35 * Math.sin(TAU * 27 * t) : 1;
    const sweep = lerp(0.9, 0.35, Math.min(1, flying * 3));
    const lift = lerp(0.12, 0.45, Math.min(1, flying * 3));
    wingR.scale.setScalar(buzz); wingL.scale.setScalar(buzz);
    wingR.rotation.set(0, sweep, lift); wingL.rotation.set(0, -sweep, -lift);
  });
}

// ---------------------------------------------------------------------------
// Bird: a round body with a breast in a second tone, a head with a beak, two
// wings and a fanned tail, about 0.17 from beak to tail; robin, sparrow or
// bluebird tones.
//
// It perches on top of its home's crown (perchY), a seeded step (up to 0.15)
// off centre, turns its head, and every few seconds hops and turns. Every
// 20-40 s (one seeded schedule, repeating) it flies a short arc down to the
// ground beside the tree, pecks for a few seconds, and flies back up to the
// same spot. Wings fold along its back when it sits and beat in flight.
// About 76 triangles.

const BIRD_REACH = 0.105;
const FLY = 1.4; // seconds for each flight, down and back

function buildBird(seed: number, theme: Theme, home: Home, group: THREE.Group): AnimalModel {
  const rand = mulberry32(seed);
  const kit: Kit = { tr: { geometries: [], materials: [] }, paints: [], theme };
  const tones = BIRDS[Math.floor(rand() * BIRDS.length)];
  const backMat = paint(kit, tones.back);
  const breastMat = paint(kit, tones.breast);
  const wingMat = paint(kit, tones.wing, { side: THREE.DoubleSide });
  const headMat = paint(kit, tones.head);
  const beakMat = paint(kit, BEAK);

  const root = new THREE.Group(); // feet on the perch
  group.add(root);
  const pitch = new THREE.Group(); // tips forward to peck
  pitch.position.set(0, 0.035, 0);
  root.add(pitch);
  const body = mesh(pitch, lumpGeometry(kit.tr, "ico0", rand, 0.08), backMat, "body");
  body.scale.set(0.036, 0.032, 0.048);
  body.position.set(0, 0.002, -0.005);
  const breast = mesh(pitch, lumpGeometry(kit.tr, "ico0", rand, 0.06), breastMat, "breast");
  breast.scale.set(0.027, 0.027, 0.024);
  breast.position.set(0, -0.006, 0.02);
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0.025, 0.03);
  pitch.add(head);
  const skull = mesh(head, lumpGeometry(kit.tr, "ico0", rand, 0.06), headMat, "skull");
  skull.scale.setScalar(0.022);
  skull.position.set(0, 0.01, 0.004);
  const beak = mesh(head, rod(kit.tr, 0, 0.007, 0.02, 4, true), beakMat, "beak");
  beak.position.set(0, 0.008, 0.034);
  mesh(pitch, fromTriangles(kit.tr, [
    -0.007, 0.004, -0.04, 0.007, 0.004, -0.04, 0.02, 0.014, -0.085,
    -0.007, 0.004, -0.04, 0.02, 0.014, -0.085, -0.02, 0.014, -0.085,
  ]), wingMat, "tail");
  const WING = [[0, 0.02], [0, -0.025], [0.07, -0.01], [0.045, 0.012]] as const;
  const wings: THREE.Group[] = [];
  for (const flip of [false, true]) {
    const w = new THREE.Group();
    w.name = flip ? "wingL" : "wingR";
    w.position.set(flip ? -0.03 : 0.03, 0.012, 0.01);
    mesh(w, fan(kit.tr, WING, flip), wingMat);
    pitch.add(w);
    wings.push(w);
  }
  const [wingR, wingL] = wings;

  // The perch, a little off the crown's centre, and a schedule of hops.
  const [perchX, perchZ] = discPoint(rand, Math.min(0.15, Math.max(0, home.radius - BIRD_REACH - 0.02)));
  const perchY = home.perchY - home.groundY;
  const hopEvery = 2.5 + 2 * rand();
  const yawBase = rand() * TAU, yawK = 1.3 + rand();
  const perchYaw = (k: number) => yawBase + 1.1 * Math.sin(k * yawK);
  const headHz = 0.35 + 0.2 * rand();
  // The trip to the ground.
  const period = 20 + 20 * rand();
  const peck = 3 + 2 * rand();
  const trip = FLY + peck + FLY;
  const start = 6 + rand() * Math.max(0, period - 8 - trip);
  const dir = rand() * TAU;
  const dist = home.radius + 0.12 + 0.24 * rand(); // beside the tree, within radius + 0.6
  const groundX = dist * Math.cos(dir), groundZ = dist * Math.sin(dir);
  const outYaw = facing(groundX - perchX, groundZ - perchZ);
  const backYaw = outYaw + Math.PI;
  const arc = 0.12; // the arc's rise above the straight line, well under perchY + 0.5
  group.position.set(home.x, home.groundY, home.z);

  let x = 0, y = 0, z = 0, yaw = 0, flying = 0, peckA = 0;
  return finish(group, kit, (t) => {
    const p = wrap(t, period);
    const q = p - start;
    flying = 0; peckA = 0;
    if (q >= 0 && q < trip) {
      if (q < FLY) { // down
        const u = q / FLY, s = smooth(u);
        x = lerp(perchX, groundX, s); z = lerp(perchZ, groundZ, s); y = lerp(perchY, 0, s) + arc * Math.sin(Math.PI * u);
        yaw = lerpAngle(perchYaw(Math.floor(start / hopEvery)), outYaw, smooth(u * 4));
        flying = Math.sin(Math.PI * u) > 0.15 ? 1 : Math.sin(Math.PI * u) / 0.15;
      } else if (q < FLY + peck) { // pecking on the ground
        const k = q - FLY;
        x = groundX; z = groundZ; y = 0; yaw = outYaw + 0.5 * Math.sin(TAU * k / peck);
        peckA = 0.45 * Math.max(0, Math.sin(TAU * k * 1.6));
      } else { // back up
        const u = (q - FLY - peck) / FLY, s = smooth(u);
        x = lerp(groundX, perchX, s); z = lerp(groundZ, perchZ, s); y = lerp(0, perchY, s) + arc * Math.sin(Math.PI * u);
        const k = Math.floor((start + trip) / hopEvery);
        yaw = u < 0.75 ? lerpAngle(outYaw, backYaw, smooth(u * 4)) : lerpAngle(backYaw, perchYaw(k), smooth((u - 0.75) * 4));
        flying = Math.sin(Math.PI * u) > 0.15 ? 1 : Math.sin(Math.PI * u) / 0.15;
      }
    } else { // perched: hop now and then, turning a little on each hop
      const k = Math.floor(t / hopEvery), h = wrap(t, hopEvery) / 0.3;
      x = perchX; z = perchZ;
      y = perchY + (h < 1 ? 0.025 * Math.sin(Math.PI * h) : 0);
      yaw = h < 1 ? lerpAngle(perchYaw(k - 1), perchYaw(k), smooth(h)) : perchYaw(k);
    }
    root.position.set(x, y + 0.03 * Math.sin(peckA), z);
    root.rotation.y = yaw;
    pitch.rotation.x = peckA;
    head.rotation.y = flying > 0 || peckA > 0 ? 0 : 0.55 * Math.sin(TAU * headHz * t) + 0.25 * Math.sin(TAU * 1.3 * headHz * t + 1);
    const flap = 0.35 + 0.65 * Math.sin(TAU * 9 * t);
    const sweep = lerp(1.4, 0.15, flying), lift = lerp(-0.12, flap, flying);
    wingR.rotation.set(0, sweep, lift); wingL.rotation.set(0, -sweep, -lift);
  });
}

// ---------------------------------------------------------------------------
// Squirrel: a body with a pale belly, a head with two pointed ears, and a big
// bushy tail of three faceted lumps curling up behind, about 0.18 long plus
// the tail, warm red-brown.
//
// Each seeded cycle of 8-12 s it sits up on its haunches by the tree, tail
// flicking, then drops down and scampers part of the way round the trunk
// (a loop kept inside the home's radius), and sits up again. About 100
// triangles.

const SQUIRREL_REACH = 0.125;

function buildSquirrel(seed: number, theme: Theme, home: Home, group: THREE.Group): AnimalModel {
  const rand = mulberry32(seed);
  const kit: Kit = { tr: { geometries: [], materials: [] }, paints: [], theme };
  const bodyMat = paint(kit, SQUIRREL.body);
  const bellyMat = paint(kit, SQUIRREL.belly);
  const tailMat = paint(kit, SQUIRREL.tail);
  const earMat = paint(kit, SQUIRREL.ear);

  const root = new THREE.Group(); // feet on the ground
  group.add(root);
  const body = new THREE.Group(); // pivots at the haunches to sit up
  body.name = "body";
  body.position.set(0, 0.012, -0.045);
  root.add(body);
  const trunk = mesh(body, lumpGeometry(kit.tr, "ico0", rand, 0.08), bodyMat, "torso");
  trunk.scale.set(0.036, 0.032, 0.062);
  trunk.position.set(0, 0.022, 0.045);
  const belly = mesh(body, octa(kit.tr, 1), bellyMat, "belly");
  belly.scale.set(0.024, 0.02, 0.04);
  belly.position.set(0, 0.012, 0.06);
  const head = mesh(body, octa(kit.tr, 1), bodyMat, "headMesh");
  head.scale.set(0.024, 0.024, 0.032);
  head.position.set(0, 0.05, 0.112);
  for (const s of [-1, 1]) {
    const ear = mesh(body, track(kit.tr, new THREE.TetrahedronGeometry(0.011, 0)), earMat, "ear");
    ear.position.set(0.012 * s, 0.074, 0.104);
  }
  const tail = new THREE.Group(); // stays behind on the ground when it sits up
  tail.name = "tail";
  tail.position.set(0, 0.02, -0.05);
  root.add(tail);
  const LUMPS = [[0.026, 0.018, -0.012], [0.032, 0.058, -0.03], [0.03, 0.105, -0.022]] as const;
  for (const [r, ly, lz] of LUMPS) {
    const lump = mesh(tail, lumpGeometry(kit.tr, "ico0", rand, 0.15), tailMat, "tuft");
    lump.scale.set(r * 0.8, r, r);
    lump.position.set(0, ly, lz);
  }

  const loopR = Math.max(0.05, Math.min(0.22 + 0.1 * rand(), home.radius - SQUIRREL_REACH - 0.02));
  const dir = rand() < 0.5 ? -1 : 1;
  const theta0 = rand() * TAU;
  const period = 8 + 4 * rand();
  const sit = 3 + 2 * rand();
  const settle = 0.5; // seconds to sit up again at the end of a run
  const runs = period - sit - settle;
  const lap = (0.5 + 0.7 * rand()) * Math.PI; // how far round each run goes
  const flickHz = 1.4 + 0.6 * rand();
  group.position.set(home.x, home.groundY, home.z);

  return finish(group, kit, (t) => {
    const n = Math.floor(t / period), p = t - n * period;
    const ran = p < sit ? 0 : p < sit + runs ? smooth((p - sit) / runs) : 1;
    const th = theta0 + dir * lap * (n + ran);
    root.position.set(loopR * Math.cos(th), 0, loopR * Math.sin(th));
    root.rotation.y = facing(-Math.sin(th) * dir, Math.cos(th) * dir);
    // Sitting up: fully up at the start of each cycle, down while running, up again at the end.
    const up = p < sit - 0.4 ? 1 : p < sit ? 1 - smooth((p - (sit - 0.4)) / 0.4) : p > period - settle ? smooth((p - (period - settle)) / settle) : 0;
    const running = p > sit && p < sit + runs ? Math.sin(Math.PI * (p - sit) / runs) : 0;
    body.rotation.x = -0.95 * up;
    body.position.y = 0.012 + 0.012 * Math.abs(Math.sin(TAU * 3.5 * t)) * running;
    // Flicks while sitting, streams out low while running.
    tail.rotation.x = 0.28 * up * Math.sin(TAU * flickHz * t) * (0.5 - 0.5 * Math.cos(TAU * t / 2.2)) - 0.45 * running;
  });
}

// ---------------------------------------------------------------------------

export function buildAnimal(kind: AnimalKind, seed: number, theme: Theme, home: Home): AnimalModel {
  const group = new THREE.Group();
  group.name = kind.toLowerCase();
  switch (kind) {
    case "BUTTERFLY": return buildButterfly(seed, theme, home, group);
    case "BEE": return buildBee(seed, theme, home, group);
    case "BIRD": return buildBird(seed, theme, home, group);
    case "SQUIRREL": return buildSquirrel(seed, theme, home, group);
  }
}
