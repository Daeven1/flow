// Today's Forage ordering rules, kept pure so they can be tested.
//
// The saved order (DailyLog.forageOrder) is a JSON list of task ids. It holds:
//   1. the tasks showing in Forage right now, top to bottom, and after them
//   2. ids of tasks this page can't see (the other Professional/Personal mode),
//      kept so switching modes doesn't wipe that mode's dragged order.
// Tasks the page can see but that have left Forage (done, or moved later) are dropped.

import { addDays, parseISO, startOfDay } from "date-fns";

export interface ForageCandidate {
  id: string;
  done: boolean;
  deadline: string | null;
  createdAt?: string | null;
}

/** Keep the saved list from growing forever with ids of long-gone tasks. */
export const MAX_SAVED_IDS = 300;

/** Forage shows open tasks due today or tomorrow (or overdue). */
export function isForageTask(t: ForageCandidate, now: Date = new Date()): boolean {
  if (t.done || !t.deadline) return false;
  return startOfDay(parseISO(t.deadline)) <= addDays(startOfDay(now), 1);
}

export function parseForageOrder(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface MergedForageOrder {
  /** Ids to show in Forage, top to bottom. */
  visible: string[];
  /** Ids of tasks this page can't see, kept at the end of the saved list. */
  elsewhere: string[];
}

/**
 * Combine the saved order with the tasks the page just loaded.
 * - Tasks already in the saved order keep their place (your dragged order).
 * - Tasks not in it yet go on top, the most recently added first.
 */
export function mergeForageOrder(
  saved: string[],
  tasks: ForageCandidate[],
  now: Date = new Date()
): MergedForageOrder {
  const forage = tasks.filter((t) => isForageTask(t, now));
  const forageIds = new Set(forage.map((t) => t.id));
  const known = new Set(tasks.map((t) => t.id));

  const seen = new Set<string>();
  const kept: string[] = [];
  const elsewhere: string[] = [];
  for (const id of saved) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (forageIds.has(id)) kept.push(id);
    else if (!known.has(id)) elsewhere.push(id);
  }

  const created = (t: ForageCandidate) => (t.createdAt ? Date.parse(t.createdAt) : 0);
  const newcomers = forage
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => created(b) - created(a))
    .map((t) => t.id);

  const visible = [...newcomers, ...kept];
  return { visible, elsewhere: elsewhere.slice(0, Math.max(0, MAX_SAVED_IDS - visible.length)) };
}

/** The list to save: what's showing, then the ids kept for the other mode. */
export function serializeForageOrder(m: MergedForageOrder): string {
  return JSON.stringify([...m.visible, ...m.elsewhere]);
}

/** Move one item, as a drag does. Returns a new list. */
export function moveForageItem(list: string[], from: number, to: number): string[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return list;
  next.splice(to, 0, moved);
  return next;
}
