export const SPECIES = ["WILDFLOWERS", "FERN", "BERRY_BUSH", "TREE"] as const;
export type Species = (typeof SPECIES)[number];
/** Seeds a new plant costs. */
export const COST: Record<Species, number> = { WILDFLOWERS: 0, FERN: 0, BERRY_BUSH: 2, TREE: 3 };
/** TREE: 1 sapling, 2 young tree, 3 mature tree; every other species is always 1. */
export const MAX_STAGE = 3;
export type PlantStatus = "ALIVE" | "WITHERED";
export type Spot = { x: number; y: number };
export type GrovePlant = {
  id: string; species: Species; x: number; y: number;
  status: PlantStatus; plantedAt: string; witheredAt: string | null; // ISO strings
  stage: number;
};
export type PlantChoice = { species: Species; x: number; y: number; tendId?: string };

/** A living tree that has not reached its last stage. */
export function canTend(p: GrovePlant): boolean {
  return p.species === "TREE" && p.status === "ALIVE" && p.stage < MAX_STAGE;
}

export function isSpecies(v: unknown): v is Species {
  return typeof v === "string" && (SPECIES as readonly string[]).includes(v);
}

/** Smallest even n >= 6 with plantCount <= n*n - 6. */
export function gridSize(plantCount: number): number {
  let n = 6;
  while (plantCount > n * n - 6) n += 2;
  return n;
}

/** Every integer pair with x, y in [-n/2, n/2 - 1]. */
export function spots(n: number): Spot[] {
  const lo = -n / 2;
  const hi = n / 2 - 1;
  const out: Spot[] = [];
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) out.push({ x, y });
  }
  return out;
}

export function freeSpots(n: number, plants: Spot[]): Spot[] {
  const taken = new Set(plants.map((p) => `${p.x},${p.y}`));
  return spots(n).filter((s) => !taken.has(`${s.x},${s.y}`));
}

function closestTo(candidates: Spot[], target: Spot): Spot | null {
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of candidates) {
    const d = (s.x - target.x) ** 2 + (s.y - target.y) ** 2;
    if (
      best === null ||
      d < bestD ||
      (d === bestD && (s.y < best.y || (s.y === best.y && s.x < best.x)))
    ) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

export function defaultSpot(n: number, plants: Spot[]): Spot | null {
  return closestTo(freeSpots(n, plants), { x: -0.5, y: -0.5 });
}

export function nearestFree(n: number, plants: Spot[], want: Spot): Spot | null {
  const free = freeSpots(n, plants);
  const exact = free.find((s) => s.x === want.x && s.y === want.y);
  if (exact) return { x: exact.x, y: exact.y };
  return closestTo(free, want);
}

/**
 * The instant a withered plant disappears: local midnight at the start of the
 * day after next. tzOffsetMin follows Date.prototype.getTimezoneOffset().
 */
export function witherExpiry(witheredAt: Date, tzOffsetMin: number): Date {
  const local = new Date(witheredAt.getTime() - tzOffsetMin * 60_000);
  const localMidnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 2,
  );
  return new Date(localMidnight + tzOffsetMin * 60_000);
}

/** A getTimezoneOffset() value from a request: an integer in minutes, clamped to ±840; 0 when absent or not a number. */
export function parseTz(v: unknown): number {
  const raw = Number.parseInt(String(v ?? ""), 10);
  return Number.isNaN(raw) ? 0 : Math.min(840, Math.max(-840, raw));
}

export function parsePlantChoice(v: unknown): PlantChoice | null {
  if (typeof v !== "object" || v === null) return null;
  const { species, x, y, tendId } = v as Record<string, unknown>;
  if (!isSpecies(species)) return null;
  const ok = (c: unknown): c is number =>
    typeof c === "number" && Number.isInteger(c) && c >= -20 && c <= 19;
  if (!ok(x) || !ok(y)) return null;
  if (tendId === undefined) return { species, x, y };
  if (typeof tendId !== "string" || tendId.length === 0 || tendId.length > 64) return null;
  if (species !== "TREE") return null;
  return { species, x, y, tendId };
}
