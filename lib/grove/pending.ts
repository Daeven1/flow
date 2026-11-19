import type { Outcome } from "@/lib/focus/session";
import { gridSize, nearestFree, type GrovePlant, type Species } from "./layout";

/** A session's plant that may not have reached the server yet. */
export type PendingPlant = {
  species: Species; x: number; y: number; // the spot the session chose
  outcome: Outcome; startedAt: number; endedAt: number; // ms epoch
};

/**
 * Whether the grove already has this session's plant: one on its spot, or
 * (the server moved it) one of its species elsewhere, planted at or after the
 * session started. The same rule SessionEnd uses.
 */
export function hasLanded(plants: GrovePlant[], ended: PendingPlant): boolean {
  return plants.some((p) => {
    const at = Date.parse(p.plantedAt);
    if (at < ended.startedAt) return false;
    if (p.x === ended.x && p.y === ended.y) return true;
    // Moved: the server plants it at the session's end time, so a later
    // session's plant of the same species is not this one.
    return p.species === ended.species && at <= ended.endedAt;
  });
}

/**
 * The grove with a just-ended session's plant added as a temporary entry
 * until a refresh shows the saved one. If its spot is taken it moves to the
 * nearest free spot, as the server does.
 */
export function withPendingPlant(plants: GrovePlant[], ended: PendingPlant): GrovePlant[] {
  if (hasLanded(plants, ended)) return plants;
  const want = { x: ended.x, y: ended.y };
  const spot =
    nearestFree(gridSize(plants.length + 1), plants, want) ??
    nearestFree(gridSize(plants.length + 7), plants, want);
  if (!spot) return plants;
  const kept = ended.outcome === "COMPLETED" || ended.outcome === "CLEARED";
  const at = new Date(ended.endedAt).toISOString();
  return [
    ...plants,
    {
      id: `pending:${ended.startedAt}`,
      species: ended.species,
      x: spot.x,
      y: spot.y,
      status: kept ? "ALIVE" : "WITHERED",
      plantedAt: at,
      witheredAt: kept ? null : at,
    },
  ];
}
