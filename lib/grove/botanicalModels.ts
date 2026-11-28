import { buildChicorySeed, seedHeight } from "./chicorySowing";
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

/** A shallow oval of freshly disturbed soil remains visible after sowing. */
function furrow(shape: BotanicalShape) {
  const center = point(0, 0.010, 0);
  const edge = (i: number) => {
    const a = 2 * Math.PI * i / 16;
    return radial(radial(point(0, 0.002, 0), shape.seedAngle, 0.125 * Math.cos(a)),
      shape.seedAngle + Math.PI / 2, 0.076 * Math.sin(a));
  };
  for (let i = 0; i < 16; i++) shape.triangle(center, edge(i + 1), edge(i), i % 4 ? 0x78563c : 0x866447);
}

function seedling(shape: BotanicalShape, t: number, chicory: boolean) {
  const seed = 1 - phase(t, 0.04, 0.19);
  const leaves = phase(t, 0.015, 0.16) * (1 - phase(t, 0.22, 0.35));
  if (chicory && t === 0) furrow(shape);
  if (!chicory && seed > 0) {
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
  let achene: ReturnType<typeof buildChicorySeed> | undefined;
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
    if (achene) achene.visible = false;
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
    if (species === "CHICORY" && next === 0) geo.translate(0, 0.004, 0);
    else {
      // Keep the first pair of cotyledons small, then join the established growth curve.
      const scale = species === "CHICORY" && next <= 2 ? next * 0.32 : 1;
      geo.scale(xzScale * scale, yScale * scale, xzScale * scale);
    }
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
    setSowing(elapsed) {
      const y = species === "CHICORY" && frame === 0 ? seedHeight(elapsed) : null;
      if (y === null) {
        if (achene) achene.visible = false;
        return;
      }
      if (!achene) {
        achene = buildChicorySeed(new BotanicalShape(seed, false).seedAngle);
        group.add(achene);
      }
      achene.position.y = y;
      achene.visible = true;
    },
    setWithered(value) {
      const next = index > 0 || !Number.isFinite(value) ? 0 : THREE.MathUtils.clamp(value, 0, 1);
      if (next !== wilt) { wilt = next; applyWilt(); }
    },
    dispose() {
      mesh.geometry.dispose(); material.dispose();
      achene?.geometry.dispose(); achene?.material.dispose();
    },
  };
}
