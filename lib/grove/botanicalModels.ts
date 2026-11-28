import * as THREE from "three";
import { drawCanopy } from "./botanicalCanopy";
import { drawFlower } from "./botanicalFlowers";
import { BotanicalShape, point, radial, phase, mix } from "./botanicalShape";
import type { Species } from "./layout";
import type { PlantModel, Theme } from "./models";
import { GROWTH_STEPS, growthFrame } from "./growth";

type NamedSpecies = Exclude<Species, "WILDFLOWERS" | "FERN" | "BERRY_BUSH" | "TREE">;
const dimensions = {
  CHICORY: [0.81, 0.51],
  FIREWEED: [0.92, 0.44],
  CANADA_COLUMBINE: [0.72, 0.50],
  BLUE_FLAG_IRIS: [0.75, 0.49],
  OSTRICH_FERN: [0.73, 0.58],
  MAIDENHAIR_FERN: [0.61, 0.53],
} as const;
const treeHeights = [0.8, 1.3, 1.9];
const treeReach = [0.49, 0.66, 0.87];
const isTree = (species: NamedSpecies) => species === "PAPER_BIRCH" || species === "WHITE_SPRUCE";
const stageIndex = (stage: number) => Math.min(2, Math.max(0, Math.round(Number.isFinite(stage) ? stage : 1) - 1));

export function botanicalHeight(species: NamedSpecies, stage: number) {
  return isTree(species) ? treeHeights[stageIndex(stage)] : dimensions[species][0];
}

export function botanicalReach(species: NamedSpecies, stage: number) {
  return isTree(species) ? treeReach[stageIndex(stage)] : dimensions[species][1];
}

/** Common chicory has a small ribbed achene, tapered below the blunt crown. */
function chicorySeed(shape: BotanicalShape, size: number) {
  const bearing = shape.seedAngle;
  const foot = radial(point(0, 0.010 * size, 0), bearing, -0.054 * size);
  const crown = radial(foot, bearing, 0.102 * size, 0.129 * size);
  const axis = crown.clone().sub(foot).normalize();
  const side = point(-Math.sin(bearing), 0, Math.cos(bearing));
  const across = axis.clone().cross(side);
  const ring = (fraction: number, radius: number) => Array.from({ length: 5 }, (_, i) => {
    const turn = 2 * Math.PI * i / 5;
    return foot.clone().lerp(crown, fraction).addScaledVector(side, Math.cos(turn) * radius * size)
      .addScaledVector(across, Math.sin(turn) * radius * size);
  });
  const lower = ring(0.18, 0.022), upper = ring(0.89, 0.047);
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5, brown = i % 2 ? 0xaa7742 : 0x97643c;
    shape.triangle(foot, lower[i], lower[j], brown);
    shape.triangle(lower[i], upper[i], upper[j], brown);
    shape.triangle(lower[i], upper[j], lower[j], brown);
    shape.triangle(upper[i], crown, upper[j], 0xc4a36d);
    shape.rod(lower[i], upper[i], size * 0.0039, 0xd5b681, size * 0.0022);
  }
}

function seedling(shape: BotanicalShape, t: number, chicory: boolean) {
  const seed = 1 - phase(t, 0.04, 0.19);
  const leaves = phase(t, 0.015, 0.16) * (1 - phase(t, 0.22, 0.35));
  if (chicory && seed > 0) {
    chicorySeed(shape, seed);
    const root = phase(t, 0.015, 0.12);
    if (root > 0) {
      const start = radial(point(0, 0.010 * seed, 0), shape.seedAngle, -0.054 * seed);
      const bend = radial(start, shape.seedAngle + 2.8, root * 0.039, -0.018 * root);
      shape.rod(start, bend, 0.007 * seed, 0xe4d49c);
      shape.rod(bend, radial(bend, shape.seedAngle + 2.0, root * 0.045), 0.005 * seed, 0xf1dea5, 0);
    }
  } else if (seed > 0) {
    shape.gem(point(0, 0.047 * seed, 0), 0.093 * seed, 0.047 * seed, 0.057 * seed, 0x957042);
    // Pale inner seam makes the split hull readable at the first milestone.
    shape.leaf(point(-0.058 * seed, 0.063 * seed, 0), point(0.064 * seed, 0.066 * seed, 0), 0.017 * seed, 0xd0ba78);
  }
  if (leaves > 0) {
    const top = point(0, 0.16 * leaves, 0);
    shape.rod(point(0, 0, 0), top, 0.013 * leaves, 0x508347);
    for (const side of [0, Math.PI]) {
      shape.leaf(top, radial(top, shape.seedAngle + side, 0.112 * leaves, 0.040 * leaves), 0.045 * leaves, 0x8db954);
    }
  }
}

/** Each time pose is a complete redraw of the organs that exist at that age.
 * A mesh is retained between milestones, including during orbit and ambient sway. */
export function buildBotanical(species: NamedSpecies, seed: number, theme: Theme, stage: number): PlantModel {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    flatShading: true, roughness: 0.86, vertexColors: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = species;
  group.add(mesh);
  const tree = isTree(species);
  const fern = species === "OSTRICH_FERN" || species === "MAIDENHAIR_FERN";
  const index = tree ? stageIndex(stage) : 0;
  const height = botanicalHeight(species, stage);
  const startHeight = index ? treeHeights[index - 1] : 0.365 * height;
  const endReach = botanicalReach(species, stage);
  const startReach = index ? treeReach[index - 1] : endReach;
  let frame = -1;
  let wilt = 0;
  let originalColors: number[] = [];
  const dry = new THREE.Color(0xb59a62);

  function applyWilt() {
    mesh.scale.y = 1 - 0.36 * wilt;
    const colors = mesh.geometry.getAttribute("color");
    if (!colors) return;
    for (let i = 0; i < colors.count; i++) {
      colors.setXYZ(i, mix(originalColors[i * 3], dry.r, wilt),
        mix(originalColors[i * 3 + 1], dry.g, wilt), mix(originalColors[i * 3 + 2], dry.b, wilt));
    }
    colors.needsUpdate = true;
  }

  function setGrowth(progress: number) {
    const next = growthFrame(progress);
    if (frame === next) return;
    frame = next;
    const fraction = frame / GROWTH_STEPS;
    // A tended tree starts with precisely the final silhouette of its last session.
    const age = tree ? (index + fraction) / 3 : fraction;
    const shape = new BotanicalShape(seed, theme === "dark");
    if (!fern && age < 0.35) seedling(shape, tree ? age * 3 : age, species === "CHICORY");
    if (species === "OSTRICH_FERN" || species === "MAIDENHAIR_FERN" ||
        species === "PAPER_BIRCH" || species === "WHITE_SPRUCE") {
      drawCanopy(shape, species, age);
    } else {
      drawFlower(shape, species, age);
    }

    const geo = new THREE.BufferGeometry();
    const positions = new THREE.Float32BufferAttribute(shape.positions, 3);
    geo.setAttribute("position", positions);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(shape.colors, 3));
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const yScale = mix(startHeight, height, fraction) / Math.max(0.001, box.max.y - box.min.y);
    const initialSpread = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    // Give the seed / young crozier a readable footprint, including at distant spots.
    const minScale = next === 0 && !index ? 0.305 / Math.max(0.001, initialSpread) : 0;
    let radius = 0;
    for (let i = 0; i < positions.count; i++) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
    const xzScale = Math.min(Math.max(yScale, minScale), mix(startReach, endReach, fraction) / Math.max(0.001, radius));
    geo.translate(0, -box.min.y, 0);
    geo.scale(xzScale, yScale, xzScale);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = geo;
    originalColors = shape.colors;
    applyWilt();
  }
  setGrowth(1);
  return {
    group, setGrowth,
    setWithered(value) {
      const next = index > 0 || !Number.isFinite(value) ? 0 : THREE.MathUtils.clamp(value, 0, 1);
      if (next !== wilt) { wilt = next; applyWilt(); }
    },
    dispose() { mesh.geometry.dispose(); material.dispose(); },
  };
}
