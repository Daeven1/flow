import { COST, type PlantChoice } from "./layout";

/** Ticks before this moment never earned seeds. */
export const SEEDS_SINCE = new Date("2026-11-21T00:00:00+08:00");

/** Seeds gained or lost by a task changing from wasDone to isDone: only a real flip counts. */
export function seedDelta(wasDone: boolean, isDone: boolean): -1 | 0 | 1 {
  if (wasDone === isDone) return 0;
  return isDone ? 1 : -1;
}

/**
 * Seeds gained or lost when a task goes from `before` to isDone. Unticking a
 * task finished before SEEDS_SINCE (or with no doneAt) takes nothing: it never
 * earned a seed.
 */
export function tickDelta(
  before: { done: boolean; doneAt: Date | null },
  isDone: boolean
): -1 | 0 | 1 {
  const delta = seedDelta(before.done, isDone);
  if (delta === -1 && (before.doneAt === null || before.doneAt < SEEDS_SINCE)) return 0;
  return delta;
}

export function balance(earned: number, spent: number): number {
  return Math.max(0, earned - spent);
}

/** Seeds a plant choice costs: nothing for no plant or for tending a tree. */
export function costOf(choice: PlantChoice | null): number {
  if (!choice || choice.tendId !== undefined) return 0;
  return COST[choice.species];
}
