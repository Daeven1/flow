import * as THREE from "three";

export const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const mix = THREE.MathUtils.lerp;
export const phase = (t: number, from: number, to: number) => THREE.MathUtils.smoothstep(t, from, to);
export const radial = (at: THREE.Vector3, angle: number, radius: number, rise = 0) =>
  point(at.x + Math.cos(angle) * radius, at.y + rise, at.z + Math.sin(angle) * radius);

/** A whole botanical drawing is one small, flat-shaded, vertex-colored mesh. */
export class BotanicalShape {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly seedAngle: number;
  private shades = new Map<number, THREE.Color>();

  constructor(seed: number, private dark: boolean) {
    this.seedAngle = ((Math.imul(seed, 2654435761) >>> 0) / 4294967296) * Math.PI * 2;
  }

  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) {
    let shade = this.shades.get(color);
    if (!shade) {
      shade = new THREE.Color(color);
      if (this.dark) shade.offsetHSL(0, 0.015, 0.055);
      this.shades.set(color, shade);
    }
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.colors.push(shade.r, shade.g, shade.b);
  }

  /** A tapered twig with an actual cross-section from any orbit angle. */
  rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, tipRadius = radius * 0.65, sides = 3) {
    const axis = b.clone().sub(a);
    if (axis.lengthSq() < 0.0000001) return;
    axis.normalize();
    const across = (Math.abs(axis.y) < 0.85 ? point(0, 1, 0) : point(1, 0, 0)).cross(axis).normalize();
    const up = axis.clone().cross(across);
    const sideAt = (i: number) => across.clone().multiplyScalar(Math.cos(i * Math.PI * 2 / sides))
      .addScaledVector(up, Math.sin(i * Math.PI * 2 / sides));
    let edge = sideAt(0);
    for (let i = 1; i <= sides; i++) {
      const next = sideAt(i);
      const p = a.clone().addScaledVector(edge, radius), q = a.clone().addScaledVector(next, radius);
      const r = b.clone().addScaledVector(edge, tipRadius), s = b.clone().addScaledVector(next, tipRadius);
      this.triangle(p, q, r, color);
      if (tipRadius > 0) this.triangle(q, s, r, color);
      edge = next;
    }
  }

  /** A creased leaf with a midrib; broad face points towards the viewer above. */
  leaf(a: THREE.Vector3, b: THREE.Vector3, halfWidth: number, color: number) {
    const side = point(b.z - a.z, 0, a.x - b.x);
    if (side.lengthSq() < 0.0000001) side.set(1, 0, 0);
    side.normalize().multiplyScalar(halfWidth);
    const middle = a.clone().lerp(b, 0.53);
    const left = middle.clone().add(side), right = middle.clone().sub(side);
    middle.y += halfWidth * 0.4;
    this.triangle(a, middle, left, color);
    this.triangle(left, middle, b, color);
    this.triangle(a, right, middle, color);
    this.triangle(middle, right, b, color);
  }

  gem(center: THREE.Vector3, rx: number, ry: number, rz: number, color: number) {
    const x = center.x, y = center.y, z = center.z;
    const rim = [point(x + rx,y,z), point(x,y,z + rz), point(x - rx,y,z), point(x,y,z - rz)];
    const top = point(x,y + ry,z), bottom = point(x,y - ry,z);
    for (let i = 0; i < 4; i++) {
      this.triangle(rim[i], top, rim[(i + 1) % 4], color);
      this.triangle(rim[i], rim[(i + 1) % 4], bottom, color);
    }
  }
}
