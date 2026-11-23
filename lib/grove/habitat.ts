import type { GrovePlant } from "./layout";

export const ANIMALS = ["BUTTERFLY", "BEE", "BIRD", "SQUIRREL"] as const;
export type AnimalKind = (typeof ANIMALS)[number];
/** home = the id of the plant it lives around; id is stable for the same grove. */
export type Resident = { kind: AnimalKind; id: string; home: string };

const MATURE = 3;

function stableOrder(ps: GrovePlant[]): GrovePlant[] {
  return [...ps].sort((a, b) =>
    a.plantedAt < b.plantedAt ? -1
    : a.plantedAt > b.plantedAt ? 1
    : a.id < b.id ? -1
    : a.id > b.id ? 1
    : 0,
  );
}

function bird(berryBushes: number, youngTrees: number, matureTrees: number): number {
  if (berryBushes < 2 || youngTrees < 1) return 0;
  let birds = Math.min(3, 1 + Math.floor((berryBushes - 2) / 2));
  if (matureTrees >= 2) birds = Math.min(5, birds + 2);
  return birds;
}

export function residents(plants: GrovePlant[]): Resident[] {
  const alive = stableOrder(plants.filter((p) => p.status === "ALIVE"));
  const flowering = alive.filter((p) => p.species === "WILDFLOWERS" || p.species === "BERRY_BUSH");
  const bushes = alive.filter((p) => p.species === "BERRY_BUSH");
  const youngTrees = alive.filter((p) => p.species === "TREE" && p.stage >= 2);
  const matureTrees = alive.filter((p) => p.species === "TREE" && p.stage >= MATURE);

  const f = flowering.length;
  const wanted: Record<AnimalKind, number> = {
    BUTTERFLY: f >= 1 ? Math.min(4, Math.ceil(f / 2)) : 0,
    BEE: f >= 5 ? 2 : f >= 2 ? 1 : 0,
    BIRD: bird(bushes.length, youngTrees.length, matureTrees.length),
    SQUIRREL: Math.min(2, matureTrees.length),
  };
  const candidates: Record<AnimalKind, GrovePlant[]> = {
    BUTTERFLY: flowering,
    BEE: flowering,
    BIRD: [...youngTrees, ...bushes],
    SQUIRREL: matureTrees,
  };

  const out: Resident[] = [];
  for (const kind of ANIMALS) {
    const homes = candidates[kind];
    for (let i = 0; i < wanted[kind] && homes.length > 0; i++) {
      out.push({ kind, id: `${kind}:${i}`, home: homes[i % homes.length].id });
    }
  }
  return out;
}

export function census(rs: Resident[]): Record<AnimalKind, number> {
  const n: Record<AnimalKind, number> = { BUTTERFLY: 0, BEE: 0, BIRD: 0, SQUIRREL: 0 };
  for (const r of rs) n[r.kind] += 1;
  return n;
}

export function newcomers(
  seen: Record<AnimalKind, number>,
  now: Record<AnimalKind, number>,
): Record<AnimalKind, number> {
  const n: Record<AnimalKind, number> = { BUTTERFLY: 0, BEE: 0, BIRD: 0, SQUIRREL: 0 };
  for (const k of ANIMALS) n[k] = Math.max(0, now[k] - seen[k]);
  return n;
}

const NAMES: Record<AnimalKind, [string, string]> = {
  BUTTERFLY: ["butterfly", "butterflies"],
  BEE: ["bee", "bees"],
  BIRD: ["bird", "birds"],
  SQUIRREL: ["squirrel", "squirrels"],
};
const WORDS = ["", "a", "two", "three", "four", "five"];

/** One line for what is new, or null when nothing is. */
export function greeting(n: Record<AnimalKind, number>): string | null {
  const parts: string[] = [];
  let total = 0;
  for (const k of ANIMALS) {
    const c = n[k];
    if (c <= 0) continue;
    total += c;
    const word = c < WORDS.length ? WORDS[c] : String(c);
    parts.push(`${word} ${NAMES[k][c === 1 ? 0 : 1]}`);
  }
  if (parts.length === 0) return null;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const sentence = list[0].toUpperCase() + list.slice(1);
  return `${sentence} ${total === 1 ? "has" : "have"} found your grove.`;
}
