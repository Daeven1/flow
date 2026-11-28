import * as THREE from "three";

import { CHICORY_SOW_MS } from "./sowingTime";

/** Hold above the furrow, then ease below the soil. An absent cue is already planted. */
export function seedHeight(elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= CHICORY_SOW_MS) return null;
  return THREE.MathUtils.lerp(0.083, -0.087, THREE.MathUtils.smoothstep(elapsed, 1150, CHICORY_SOW_MS));
}

export function buildChicorySeed(bearing: number) {
  // A curved, tapered achene. Fine longitudinal ribs follow its rounded hull.
  const geometry = new THREE.SphereGeometry(1, 25, 8);
  const pos = geometry.getAttribute("position");
  const colors = [];
  const base = new THREE.Color(0xae8454), ridge = new THREE.Color(0xe5c893);
  const shade = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rib = Math.pow((1 + Math.cos(5 * Math.atan2(z, x))) / 2, 3);
    const width = (0.84 + 0.18 * y) * (1 + 0.07 * rib);
    pos.setXYZ(i, 0.044 * x * width + 0.009 * y * y, 0.110 * y, 0.037 * z * width);
    shade.copy(base).lerp(ridge, rib * (1 - y * y) * 0.82);
    colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.name = "Chicory achene";
  mesh.rotation.order = "YXZ";
  mesh.rotation.set(0, bearing, 1.23);
  return mesh;
}
