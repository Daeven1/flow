import type { Species } from "./layout";
import { fullHeight, plantReach } from "./models";

// How the grove's camera allows for the plants on the island. Pure numbers,
// shared by the canvas and its tests.

export const BOUNCE_SCALE = 0.08; // a kept plant's bounce, at its biggest
export const SWAY_AMPLITUDE = 0.035; // radians, about 2 degrees
// Sway turns a plant about x by 0.6 of this and about z by all of it at once.
export const SWAY_TILT = SWAY_AMPLITUDE * Math.hypot(1, 0.6);

export type Framed = { species: Species; stage: number };

/**
 * The height and sideways reach the camera allows for at each corner of the
 * planting grid: the tallest and the widest plant actually present (saved
 * plants at their stage, the growing plant at the stage it grows into).
 * Tallest: its full height with the +6 % seeded size, the bounce and a little
 * sway. Reach: its plantReach grown by the bounce, plus how far sway tips its
 * top. A mature tree's crown counts only when a mature tree is there. An empty
 * grove frames for the smallest plant, which also covers the setup marker on
 * a free spot (a seedling about 0.42 tall in a ring of radius 0.27); its
 * wider ring around a chosen tree (0.42) only shows with that tree present.
 */
export function plantBounds(plants: Framed[]): { top: number; reach: number } {
  let h = fullHeight("BERRY_BUSH");
  let r = plantReach("BERRY_BUSH");
  for (const p of plants) {
    h = Math.max(h, fullHeight(p.species, p.stage));
    r = Math.max(r, plantReach(p.species, p.stage));
  }
  const top = h * 1.06 * (1 + BOUNCE_SCALE) + 0.03;
  return { top, reach: r * (1 + BOUNCE_SCALE) + top * Math.sin(SWAY_TILT) };
}

/** A session keeps a fixed lens from seed to mature plant. Its bounds come
 * from the chosen species, independently of plot size and neighbouring trees. */
export function growingFrame(plant: Framed, width: number, height: number) {
  const singlePlant = width < 680;
  const elevation = (singlePlant ? 14 : 18) * Math.PI / 180;
  const h = fullHeight(plant.species, plant.stage) * 1.06 * (1 + BOUNCE_SCALE);
  const reach = plantReach(plant.species, plant.stage) * (1 + BOUNCE_SCALE) + h * Math.sin(SWAY_TILT);
  const halfHeight = h / 2;
  const aspect = Math.max(1, width) / Math.max(1, height);
  const desiredFill = singlePlant ? 0.88 : 0.71;
  const verticalRadius = halfHeight * Math.cos(elevation) + reach * Math.sin(elevation);
  const depth = halfHeight * Math.sin(elevation) + reach * Math.cos(elevation);
  const distance = depth + Math.max(verticalRadius, reach / aspect) / (Math.tan(Math.PI / 12) * desiredFill);
  return { distance, elevation, centerY: halfHeight, reach, singlePlant };
}
