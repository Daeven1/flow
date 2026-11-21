import type { Outcome } from "@/lib/focus/session";
import { canTend, gridSize, isSpecies, nearestFree } from "./layout";
import type { GrovePlant, PlantChoice, PlantStatus, Spot } from "./layout";
import { costOf } from "./seeds";

export type PlantingSession = {
  id: string;
  plantSpecies: string | null;
  plantX: number | null;
  plantY: number | null;
  /** Set when the session tends an existing tree instead of growing a new plant. */
  tendPlantId: string | null;
};

export type NewPlant = {
  sessionId: string;
  species: string;
  x: number;
  y: number;
  status: PlantStatus;
  plantedAt: Date;
  witheredAt: Date | null;
};

/** The plant a finished session leaves behind, or null when it had none or tended a tree. */
export function planFor(
  session: PlantingSession,
  outcome: Outcome,
  endedAt: Date,
  occupied: Spot[],
): NewPlant | null {
  const { plantSpecies, plantX, plantY, tendPlantId } = session;
  if (tendPlantId !== null) return null;
  if (!isSpecies(plantSpecies) || plantX === null || plantY === null) return null;
  const want = { x: plantX, y: plantY };
  const spot =
    nearestFree(gridSize(occupied.length + 1), occupied, want) ??
    nearestFree(gridSize(occupied.length + 7), occupied, want);
  if (!spot) return null;
  const alive = outcome === "COMPLETED" || outcome === "CLEARED";
  return {
    sessionId: session.id,
    species: plantSpecies,
    x: spot.x,
    y: spot.y,
    status: alive ? "ALIVE" : "WITHERED",
    plantedAt: endedAt,
    witheredAt: alive ? null : endedAt,
  };
}

export type ResolvedPlant = {
  plantSpecies: string | null;
  plantX: number | null;
  plantY: number | null;
  plantCost: number;
  tendPlantId: string | null;
  /** False only when a plant (or tend) was asked for and dropped. */
  accepted: boolean;
};

const NO_PLANT = { plantSpecies: null, plantX: null, plantY: null, plantCost: 0, tendPlantId: null };

/**
 * What a session start stores for the plant choice. tree: the user's plant the
 * tend names (null when missing or not the user's). balance: the user's seeds,
 * or null when not looked up (then any paid plant is dropped).
 */
export function resolvePlant(
  choice: PlantChoice | null,
  tree: GrovePlant | null,
  balance: number | null,
): ResolvedPlant {
  if (!choice) return { ...NO_PLANT, accepted: true };
  if (choice.tendId !== undefined) {
    if (!tree || tree.id !== choice.tendId || !canTend(tree)) return { ...NO_PLANT, accepted: false };
    return {
      plantSpecies: tree.species, plantX: tree.x, plantY: tree.y,
      plantCost: 0, tendPlantId: tree.id, accepted: true,
    };
  }
  const cost = costOf(choice);
  if (cost > 0 && (balance === null || balance < cost)) return { ...NO_PLANT, accepted: false };
  return {
    plantSpecies: choice.species, plantX: choice.x, plantY: choice.y,
    plantCost: cost, tendPlantId: null, accepted: true,
  };
}

/**
 * The answer to a start sent again for a session the server already stored
 * (the first reply was lost). The server can't know what the first request
 * asked for, so: a stored plant was accepted; no stored plant was accepted
 * only when none is asked for now.
 */
export function replayedStart(
  row: { id: string; plantSpecies: string | null },
  choice: PlantChoice | null,
): { id: string; plantAccepted: boolean } {
  return { id: row.id, plantAccepted: row.plantSpecies !== null || choice === null };
}

/**
 * What a session start stores when the plant step failed on the server. A
 * free new plant needs no seeds and no lookups, so it is kept; a paid plant
 * or a tend is dropped with reason ERROR.
 */
export function fallbackPlant(choice: PlantChoice | null): ResolvedPlant & { dropReason?: "ERROR" } {
  if (!choice) return { ...NO_PLANT, accepted: true };
  if (choice.tendId === undefined && costOf(choice) === 0) return resolvePlant(choice, null, null);
  return { ...NO_PLANT, accepted: false, dropReason: "ERROR" };
}
