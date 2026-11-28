import { BotanicalShape, phase, point, radial } from "./botanicalShape";
import type { Vector3 } from "three";

type Flower = "CHICORY" | "FIREWEED" | "CANADA_COLUMBINE" | "BLUE_FLAG_IRIS";
const TAU = Math.PI * 2;
const stemGreen = 0x476d37;
const leafGreen = 0x388053;

/** A bloom can face outwards from its stalk. Draw its rays in that inclined plane. */
function petalPoint(center: Vector3, bearing: number, turn: number, reach: number, lift: number, tilt: number) {
  const forward = reach * Math.cos(turn), across = reach * Math.sin(turn);
  const p = radial(center, bearing, forward * Math.cos(tilt) + lift * Math.sin(tilt),
    lift * Math.cos(tilt) - forward * Math.sin(tilt));
  return radial(p, bearing + Math.PI / 2, across);
}

function chicoryLeaf(shape: BotanicalShape, base: Vector3, tip: Vector3, bearing: number, width: number, color: number) {
  const ridge = base.clone().lerp(tip, 0.54);
  ridge.y += width * 0.35;
  // The backward-pointing teeth are largest in the middle of a basal leaf.
  for (const side of [-1, 1]) {
    let previous = base;
    for (const [along, spread] of [[0.19, 0.72], [0.38, 0.31], [0.52, 1.15], [0.71, 0.49], [1, 0]]) {
      const edge = radial(base.clone().lerp(tip, along), bearing + side * Math.PI / 2, width * spread);
      shape.triangle(previous, edge, ridge, color);
      previous = edge;
    }
  }
}

function rosette(shape: BotanicalShape, t: number, angle: number, count: number, width: number, toothed = false) {
  for (let i = 0; i < count; i++) {
    const open = phase(t, 0.04 + i * 0.027, 0.30 + i * 0.035);
    if (open === 0) continue;
    const base = point(0, 0.014, 0);
    const tip = radial(base, angle + i * 2.40, (0.26 + 0.04 * (i % 2)) * open, 0.065 + 0.09 * open);
    const green = i % 2 ? 0x4d9855 : leafGreen;
    if (toothed) chicoryLeaf(shape, base, tip, angle + i * 2.40, width * open, green);
    else shape.leaf(base, tip, width * open, green);
  }
}

/** A chicory head has all strap-shaped florets, including the blue-violet center. */
function chicoryHead(shape: BotanicalShape, base: Vector3, open: number, angle: number, size: number, tilt: number) {
  const bud = 1 - 0.38 * open;
  shape.gem(base, 0.034 * size, 0.070 * size * bud, 0.034 * size, 0x678544);
  if (open <= 0) return;
  const center = base.clone(); center.y += size * 0.039;
  // Broad, overlapping straps with a toothed outer margin. The raised rim and
  // folded side give even a head viewed from below a visible blue surface.
  for (let i = 0; i < 12; i++) {
    const a = TAU * i / 12;
    const reach = size * (0.03 + open * 0.165) * (i % 2 ? 1 : 0.95);
    const rise = size * (0.084 - 0.045 * open);
    const innerL = petalPoint(center, angle, a - 0.24, 0.018 * size, 0, tilt);
    const innerR = petalPoint(center, angle, a + 0.24, 0.018 * size, 0, tilt);
    const left = petalPoint(center, angle, a - 0.246, reach, rise, tilt);
    const middle = petalPoint(center, angle, a, reach * 0.88, rise - 0.004 * size, tilt);
    const right = petalPoint(center, angle, a + 0.246, reach, rise, tilt);
    // Give one edge of the floret a lip, like a loosely curled piece of paper.
    const fold = petalPoint(center, angle, a + 0.17, reach * 0.87, rise - 0.028 * size, tilt);
    const blue = i % 3 === 0 ? 0xaebffb : i % 3 === 1 ? 0x8db3ff : 0x7798f7;
    shape.triangle(innerL, middle, left, blue);
    shape.triangle(innerL, innerR, middle, blue);
    shape.triangle(innerR, right, middle, blue);
    shape.triangle(innerR, fold, right, 0xadc6ff);
  }
  shape.gem(center, 0.042 * size, 0.035 * size, 0.042 * size, 0x8685c9);
}

function drawChicory(shape: BotanicalShape, t: number) {
  const a = shape.seedAngle;
  rosette(shape, t, a, 7, 0.065, true);
  // Alternate angular knees and sessile buds distinguish chicory from a bouquet.
  const nodes = [point(0, 0, 0)];
  for (let i = 0; i < 4; i++) {
    const p = phase(t, 0.15 + i * 0.10, 0.45 + i * 0.095);
    if (!p) break;
    const from = nodes[i], end = radial(from, a + i * 2.75, p * (i % 2 ? 0.09 : 0.065), p * 0.235);
    shape.rod(from, end, 0.023 - i * 0.003, stemGreen);
    nodes.push(end);
    shape.leaf(end, radial(end, a + i * 2.3, 0.15 * p, 0.11 * p), 0.033 * p, leafGreen);
  }
  for (let i = 0; i < 3 && i + 1 < nodes.length; i++) {
    const stretch = phase(t, 0.31 + i * 0.10, 0.57 + i * 0.09);
    if (!stretch) continue;
    const node = nodes[i + 1];
    const base = radial(node, a + i * 2.55, stretch * (0.28 - i * 0.036), 0.15 * stretch);
    shape.rod(node, base, 0.014, stemGreen);
    chicoryHead(shape, base, phase(t, 0.55 + i * 0.115, 0.77 + i * 0.11), a + i * TAU / 3, stretch, [0.56, 0.92, 0.34][i]);
  }
  if (nodes.length === 5 && t >= 0.73) {
    chicoryHead(shape, nodes[4], phase(t, 0.78, 1), a + Math.PI, 0.86 * phase(t, 0.72, 0.89), 0.25);
  }
}

function drawFireweed(shape: BotanicalShape, t: number) {
  const a = shape.seedAngle;
  rosette(shape, t, a, 4, 0.035);
  const h = phase(t, 0.11, 0.78);
  if (!h) return;
  const crown = point(0.025 * h, h, 0);
  shape.rod(point(0, 0, 0), crown, 0.023, 0x8e594c, 0.009, 4);
  for (let i = 0; i < 10; i++) {
    const leaf = phase(t, 0.12 + 0.032 * i, 0.35 + 0.035 * i);
    if (!leaf) continue;
    const base = crown.clone().multiplyScalar(0.13 + 0.047 * i);
    shape.leaf(base, radial(base, a + i * 2.40, leaf * (0.30 - 0.014 * i), 0.072 * leaf), 0.04 * leaf, leafGreen);
  }
  // Magenta four-petalled flowers open up the raceme from bottom to tip.
  for (let i = 0; i < 8; i++) {
    const bud = phase(t, 0.44 + 0.04 * i, 0.58 + 0.04 * i);
    if (!bud) continue;
    const open = phase(t, 0.54 + 0.052 * i, 0.68 + 0.045 * i);
    const angle = a + i * 2.40, node = crown.clone().multiplyScalar(0.58 + i * 0.052);
    const head = radial(node, angle, (0.105 - i * 0.008) * bud, 0.037);
    shape.rod(node, head, 0.009 * bud, 0xb64976);
    shape.gem(head, 0.023 * bud, 0.036 * bud, 0.023 * bud, 0xba3970);
    if (!open) continue;
    const span = (0.099 - 0.004 * i) * open;
    for (let j = 0; j < 4; j++) {
      const turn = j * TAU / 4 + 0.32;
      const left = petalPoint(head, angle, turn - 0.52, span * 0.74, span * 0.25, 1.01);
      const right = petalPoint(head, angle, turn + 0.52, span * 0.74, span * 0.25, 1.01);
      const tip = petalPoint(head, angle, turn, span, span * 0.30, 1.01);
      const pink = j % 2 ? 0xf586ca : 0xd9469d;
      shape.triangle(head, left, tip, pink);
      shape.triangle(head, tip, right, pink);
    }
  }
}

function drawColumbine(shape: BotanicalShape, t: number) {
  const a = shape.seedAngle;
  for (let i = 0; i < 4; i++) {
    const open = phase(t, 0.045 + i * 0.042, 0.29 + i * 0.053);
    if (!open) continue;
    const angle = a + i * 2.39, base = point(0, 0.015, 0);
    const fork = radial(base, angle, 0.15 * open, 0.14 * open);
    shape.rod(base, fork, 0.012, stemGreen);
    for (let j = -1; j <= 1; j++) {
      shape.leaf(fork, radial(fork, angle + j * 0.80, open * 0.14, 0.048), 0.066 * open, 0x49895d);
    }
  }
  for (let i = 0; i < 3; i++) {
    const up = phase(t, 0.18 + i * 0.105, 0.53 + i * 0.095);
    if (!up) continue;
    const angle = a + i * 2.1, root = point(0, 0, 0);
    const hook = radial(root, angle, (0.17 + i * 0.035) * up, (0.90 - i * 0.09) * up);
    const bell = radial(hook, angle, up * 0.071, -0.085 * up);
    shape.rod(root, hook, 0.017, stemGreen);
    shape.rod(hook, bell, 0.012, stemGreen);
    const flower = phase(t, 0.48 + i * 0.14, 0.73 + i * 0.135);
    if (!flower) continue;
    shape.gem(bell, 0.049 * flower, 0.062 * flower, 0.049 * flower, 0xce3936);
    for (let j = 0; j < 5; j++) {
      const turn = angle + j * TAU / 5;
      const mouth = radial(bell, turn, 0.067 * flower, -0.080 * flower);
      const spur = radial(bell, turn, 0.095 * flower, 0.10 * flower);
      shape.rod(mouth, spur, 0.024 * flower, j % 2 ? 0xe95040 : 0xd73536, 0.002);
      shape.leaf(bell, radial(bell, turn + 0.3, 0.115 * flower, -0.052 * flower), 0.024 * flower, 0xe3473c);
      shape.leaf(mouth, radial(mouth, turn, 0.031 * flower, -0.018 * flower), 0.021 * flower, 0xffcd54);
    }
  }
}

function drawIris(shape: BotanicalShape, t: number) {
  const a = shape.seedAngle;
  for (let i = 0; i < 8; i++) {
    const extension = phase(t, 0.03 + i * 0.042, 0.38 + i * 0.05);
    if (!extension) continue;
    const angle = a + (i % 2 ? Math.PI : 0) + Math.sin(i) * 0.32;
    const base = radial(point(0, 0, 0), angle, (i % 3) * 0.017);
    const top = radial(base, angle, (0.13 + 0.06 * (i % 3)) * extension, (0.48 + (i % 4) * 0.072) * extension);
    shape.leaf(base, top, 0.049 * extension, i % 2 ? 0x4a9783 : 0x387963);
  }
  for (let i = 0; i < 2; i++) {
    const stem = phase(t, 0.27 + i * 0.23, 0.61 + i * 0.17);
    if (!stem) continue;
    const head = radial(point(0, 0, 0), a + i * Math.PI, stem * (i ? 0.22 : 0.075), stem * (i ? 0.70 : 0.93));
    shape.rod(point(0, 0, 0), head, 0.020, 0x477c47);
    const open = phase(t, 0.54 + i * 0.21, 0.79 + i * 0.21);
    shape.gem(head, stem * 0.041, stem * 0.074, stem * 0.041, open ? 0x8473c6 : 0x64834a);
    if (!open) continue;
    for (let j = 0; j < 3; j++) {
      const turn = a + j * TAU / 3 + i;
      const arch = radial(head, turn, 0.116 * open, 0.05 * open);
      const tip = radial(head, turn, 0.192 * open, -0.071 * open);
      shape.leaf(head, arch, 0.046 * open, 0x8d7fd9);
      shape.leaf(arch, tip, 0.070 * open, 0x7461b6);
      const blaze = arch.clone(); blaze.y += 0.009;
      shape.leaf(blaze, radial(blaze, turn, 0.047 * open, -0.031 * open), 0.014 * open, 0xffdd6d);
      shape.leaf(head, radial(head, turn + 0.92, 0.084 * open, 0.126 * open), 0.038 * open, 0xa497df);
    }
  }
}

export function drawFlower(shape: BotanicalShape, species: Flower, t: number) {
  switch (species) {
    case "CHICORY": drawChicory(shape, t); break;
    case "FIREWEED": drawFireweed(shape, t); break;
    case "CANADA_COLUMBINE": drawColumbine(shape, t); break;
    case "BLUE_FLAG_IRIS": drawIris(shape, t); break;
  }
}
