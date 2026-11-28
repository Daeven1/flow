import type { Vector3 } from "three";
import { BotanicalShape, mix, phase, point, radial } from "./botanicalShape";

type CanopySpecies = "OSTRICH_FERN" | "MAIDENHAIR_FERN" | "PAPER_BIRCH" | "WHITE_SPRUCE";
const turn = Math.PI * 2;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));

// A fine, two-sided rachis. A ribbon keeps even a mature fern in one small mesh.
function ribbon(s: BotanicalShape, a: Vector3, b: Vector3, side: number, width: number, color: number) {
  const left = radial(a, side, width);
  const right = radial(a, side, -width);
  const endLeft = radial(b, side, width * 0.7);
  const endRight = radial(b, side, -width * 0.7);
  s.triangle(left, right, endRight, color);
  s.triangle(left, endRight, endLeft, color);
}

// The tip unwinds in its own radial plane. Its terminal spiral shortens and
// narrows as pinnae unfold up the length of the frond.
function crozier(s: BotanicalShape, base: Vector3, heading: number, radius: number, color: number) {
  if (radius < 0.007) return;
  let prior = base;
  for (let i = 1; i <= 8; i++) {
    const theta = i * 0.82;
    const inner = radius * (1 - 0.073 * i);
    const next = radial(base, heading, radius - inner * Math.cos(theta), inner * Math.sin(theta));
    ribbon(s, prior, next, heading + Math.PI / 2, Math.max(0.006, radius * (0.24 - i * 0.012)), color);
    prior = next;
  }
}

function ostrichFern(s: BotanicalShape, t: number) {
  const base = point(0, 0, 0);
  for (let f = 0; f < 5; f++) {
    if (f > 1 && t < (f - 1) * 0.075) continue;
    const open = phase(t, f < 2 ? 0 : (f - 1) * 0.075, 0.76 + f * 0.055);
    const angle = s.seedAngle + f * turn / 5;
    const length = (0.26 + 0.74 * open) * (0.91 + (f % 3) * 0.045);
    const spine = (u: number) => radial(base, angle,
      0.015 + length * (0.085 * u + 0.48 * u * u * (0.35 + 0.65 * open)),
      length * (1.21 * u - 0.24 * u * u));
    const stalk = f % 2 ? 0x618638 : 0x86a24b;
    let last = base;
    for (let j = 1; j <= 4; j++) {
      const next = spine(j / 4);
      ribbon(s, last, next, angle + Math.PI / 2, 0.016, stalk);
      last = next;
    }
    crozier(s, spine(1), angle, 0.098 * (1 - open), 0x74a751);
    // Largest in the upper middle, tapering both to the foot and the pinna tips.
    for (let j = 0; j < 6; j++) {
      const u = 0.19 + 0.137 * j;
      const out = phase(open, j * 0.105, 0.38 + j * 0.105);
      if (out === 0) continue;
      const length = (0.056 + 0.145 * Math.sin(Math.PI * (j + 0.35) / 6.5)) * out;
      const joint = spine(u);
      for (const side of [-1, 1]) {
        const tip = radial(joint, angle + side * 1.15, length, out * (0.039 + 0.037 * u));
        s.leaf(joint, tip, length * 0.28, side === 1 ? 0x478851 : 0x579a52);
      }
    }
  }
  // Separate, shorter fertile frond, retained near the centre of the vase.
  const fertile = phase(t, 0.72, 1);
  if (fertile > 0) {
    const top = point(0.018, 0.54 * fertile, -0.015);
    s.rod(base, top, 0.009, 0x89673e);
    for (let j = 0; j < 5; j++) {
      const bend = base.clone().lerp(top, 0.48 + j * 0.12);
      s.leaf(bend, radial(bend, s.seedAngle + j * 2.8, 0.044 * fertile, 0.065 * fertile),
        0.02 * fertile, 0x996c43);
    }
  }
}

function pinnule(s: BotanicalShape, base: Vector3, angle: number, length: number, color: number) {
  // Wedge-shaped maidenhair leaflets widen towards the lobed outer margin.
  const center = radial(base, angle, length, length * 0.25);
  const left = radial(center, angle + Math.PI / 2, length * 0.63, -length * 0.20);
  const right = radial(center, angle - Math.PI / 2, length * 0.63, -length * 0.20);
  const notch = radial(center, angle, -length * 0.17, length * 0.10);
  s.triangle(base, left, notch, color);
  s.triangle(base, notch, right, color);
}

function maidenhairFern(s: BotanicalShape, t: number) {
  for (let f = 0; f < 3; f++) {
    const start = f < 2 ? 0 : 0.20;
    if (t < start) continue;
    const open = phase(t, start, 0.76 + 0.12 * f);
    const angle = s.seedAngle + f * turn / 3;
    const length = (0.26 + open * 0.58) * (1 - 0.085 * f);
    const base = radial(point(0, 0, 0), angle, 0.015);
    const knee = radial(base, angle, 0.044, length * 0.52);
    const fork = radial(knee, angle, 0.036 + 0.10 * open, length * 0.48);
    s.rod(base, knee, 0.013, 0x493e38);
    s.rod(knee, fork, 0.011, 0x383134);
    crozier(s, fork, angle, 0.08 * (1 - open), 0xb97849);
    for (const side of [-1, 1]) {
      let joint = fork;
      for (let j = 0; j < 3; j++) {
        const fan = phase(open, j * 0.13 + 0.06, j * 0.16 + 0.57);
        if (fan === 0) continue;
        const heading = angle + side * (1.13 + j * 0.57);
        const next = radial(joint, heading, 0.078 * fan, 0.025 * fan);
        ribbon(s, joint, next, heading + Math.PI / 2, 0.006, 0x342c30);
        const finger = heading - side * 0.66;
        const tip = radial(next, finger, (0.172 - 0.012 * j) * fan, (0.064 - 0.013 * j) * fan);
        ribbon(s, next, tip, finger + Math.PI / 2, 0.0037, 0x514437);
        for (let k = 0; k < 3; k++) {
          const base = next.clone().lerp(tip, 0.24 + k * 0.29);
          pinnule(s, base, finger + side * (k === 1 ? -1 : 1) * 0.94, (0.099 - k * 0.007) * fan,
            k === 1 ? 0x72b567 : 0x599957);
        }
        joint = next;
      }
    }
  }
}

// Folded simple leaves, with two conspicuous teeth along each side.
function birchLeaf(s: BotanicalShape, petiole: Vector3, angle: number, length: number, color: number) {
  const at = (along: number, across: number, rise: number) =>
    radial(radial(petiole, angle, along * length, rise * length), angle + Math.PI / 2, across * length);
  const midrib = at(0.47, 0, 0.36);
  const edge = [petiole, at(0.29, 0.37, 0.25), at(0.43, 0.29, 0.24), at(0.55, 0.42, 0.28),
    at(1, 0, -0.15), at(0.55, -0.42, 0.18), at(0.43, -0.29, 0.20), at(0.29, -0.37, 0.25)];
  edge.forEach((v, i) => s.triangle(midrib, v, edge[(i + 1) % edge.length], color));
}

function paperBirch(s: BotanicalShape, t: number) {
  const base = point(0, 0, 0);
  const height = 0.24 + t * 0.76;
  const lean = (h: number) => radial(base, s.seedAngle, (0.07 * h * h - 0.032 * h) * height, h * height);
  const basalWidth = 0.018 + t * 0.033;
  for (let j = 0; j < 3; j++) {
    const pale = t > 0.44 + 0.15 * j;
    s.rod(lean(j / 3), lean((j + 1) / 3), basalWidth * (1 - 0.25 * j),
      pale ? 0xe1d6be : 0x926744, basalWidth * (0.75 - 0.25 * j), 5);
  }

  // As young brown bark whitens, show small horizontal lenticels on its face.
  for (let i = 0; i < 7; i++) {
    const reveal = phase(t, 0.43 + i * 0.062, 0.55 + i * 0.062);
    if (reveal === 0) continue;
    const u = 0.13 + i * 0.092;
    const angle = s.seedAngle + i * goldenAngle;
    const bark = radial(lean(u), angle, basalWidth * (1 - 0.78 * u));
    const l = radial(bark, angle + Math.PI / 2, 0.021 * reveal);
    const r = radial(bark, angle - Math.PI / 2, 0.023 * reveal);
    s.triangle(l, radial(bark, angle, 0, 0.009 * reveal), r, 0x61584f);
  }

  // A pair of unfolding terminal leaves keeps the young leader visibly alive.
  const terminal = 0.02 + 0.12 * phase(t, 0.03, 0.26);
  birchLeaf(s, lean(0.94), s.seedAngle + 1.1, terminal, 0x82b34c);
  birchLeaf(s, lean(0.98), s.seedAngle + 3.4, terminal * 0.84, 0x94bc5c);

  for (let i = 0; i < 8; i++) {
    const birth = i === 0 ? 0 : 0.026 + i * 0.105;
    const bud = phase(t, birth, Math.min(1, birth + 0.20));
    if (bud === 0) continue;
    const u = 0.29 + i * 0.085;
    const reach = (0.20 + 0.12 * Math.sin(u * Math.PI)) * bud;
    const angle = s.seedAngle + i * goldenAngle;
    const root = lean(u);
    const joint = radial(root, angle, reach * 0.48, (0.06 + 0.04 * (i % 3)) * bud);
    const tip = radial(joint, angle + 0.27, reach * 0.52, 0.07 * bud);
    s.rod(root, joint, 0.014 * bud, 0xa08767);
    s.rod(joint, tip, 0.009 * bud, 0x8c613e);
    for (let j = 0; j < 3; j++) {
      const half = j % 2 ? -1 : 1;
      birchLeaf(s, joint.clone().lerp(tip, 0.14 + j * 0.41),
        angle + half * (j === 2 ? 0.28 : 1.09), (0.155 + 0.060 * (1 - u)) * bud,
        j === 2 ? 0x87b94e : (j === 1 ? 0x58913d : 0x72aa48));
    }
    const catkin = phase(t, 0.79 + i % 3 * 0.05, 0.90 + i % 3 * 0.05);
    if (i % 3 === 1 && catkin > 0) {
      const hang = radial(tip, angle, 0.01, -0.082 * catkin);
      s.rod(tip, hang, 0.013 * catkin, 0xae844b, 0.009 * catkin, 4);
    }
  }
}

function whiteSpruce(s: BotanicalShape, t: number) {
  const base = point(0, 0, 0);
  const height = 0.23 + 0.77 * t;
  const leader = point(0, height, 0);
  s.rod(base, leader, 0.026 + t * 0.017, 0x806c54, 0.005, 5);
  for (let tier = 0; tier < 7; tier++) {
    const birth = tier * 0.133;
    const open = phase(t, birth, Math.min(1, birth + 0.19));
    if (open === 0) continue;
    const u = 0.19 + tier * 0.114;
    const radius = (0.40 - 0.30 * u) * open;
    const center = base.clone().lerp(leader, u);
    const shade = tier % 2 ? 0x3e8275 : 0x478c7c;
    const light = tier % 2 ? 0x67a496 : 0x599e91;
    // Radial needle sprays form deep, dark gaps between the whorls. A ridge
    // along each bough and a slight upturn at its end catch the overhead light.
    for (let j = 0; j < 6; j++) {
      const angle = s.seedAngle + j * turn / 6 + (tier % 2) * 0.43;
      const upper = radial(center, angle, 0.015 * open, 0.095 * open);
      const ridge = radial(center, angle, radius * 0.52, -0.014 * open);
      const left = radial(center, angle - 0.46, radius * 0.71, -0.071 * open);
      const right = radial(center, angle + 0.46, radius * 0.71, -0.071 * open);
      // Older whorls put out another flush of needles during the mature-tree
      // session. Split the ends of the established boughs as the leader rises.
      const flush = phase(t, 0.61 + 0.017 * tier + 0.009 * (j % 3),
        Math.min(1, 0.87 + 0.018 * tier + 0.007 * (j % 3)));
      const tip = radial(center, angle, radius * (1 + 0.3 * flush), (-0.056 + 0.045 * flush) * open);
      s.triangle(upper, left, ridge, shade);
      s.triangle(upper, ridge, right, light);
      s.triangle(left, tip, ridge, shade);
      s.triangle(ridge, tip, right, light);
      s.triangle(center, right, left, 0x376f65);
      if (flush > 0) {
        for (const side of [-1, 1]) {
          const edge = side < 0 ? left : right;
          const shoot = radial(center, angle + side * 0.36, radius * (0.66 + 0.47 * flush),
            (-0.07 + 0.068 * flush) * open);
          s.triangle(ridge, edge, shoot, 0x74ad93);
        }
      }
      // Slender pendent cones hang beneath the larger upper boughs.
      if (t > 0.77 && tier > 2 && tier < 6 && j === tier) {
        const size = phase(t, 0.77 + 0.04 * (tier - 3), 0.91 + 0.04 * (tier - 3));
        const cone = radial(ridge, angle, radius * 0.15, -0.053 * size);
        s.gem(cone, 0.023 * size, 0.058 * size, 0.023 * size, 0xad8253);
      }
    }
  }
}

export function drawCanopy(s: BotanicalShape, species: CanopySpecies, t: number) {
  switch (species) {
    case "OSTRICH_FERN": return ostrichFern(s, t);
    case "MAIDENHAIR_FERN": return maidenhairFern(s, t);
    case "PAPER_BIRCH": return paperBirch(s, t);
    case "WHITE_SPRUCE": return whiteSpruce(s, t);
  }
}
