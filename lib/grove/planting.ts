import type { Outcome } from "@/lib/focus/session";
import { gridSize, isSpecies, nearestFree } from "./layout";
import type { PlantStatus, Spot } from "./layout";

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
