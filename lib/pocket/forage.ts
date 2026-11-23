// Today's Forage, as the pocket board and JARVIS see it.
//
// The Daily page lets David drag Today's Forage into the order he means to work in
// (lib/forage/order.ts, saved in DailyLog.forageOrder). Anything that shows "his next
// tasks" somewhere else must use that order, not the order of the deadlines.
//
// These are the page's rules again, with one difference: "today" here is always the
// Shanghai date, because this runs on a server in UTC and not in David's browser.

import { parseForageOrder } from "@/lib/forage/order";
import { dayNumber, dueAbs, dueLabel, LIMIT, shortTitle, type PageTask } from "./idle";

export type BoardTask = {
  id: string;
  name: string;
  deadline: Date | null;
  scheduledDate: Date | null;
  createdAt: Date;
};

/** Forage shows open tasks due today or tomorrow, or overdue. (Callers pass open tasks.) */
export function inForage(t: Pick<BoardTask, "deadline">, now: Date): boolean {
  return t.deadline !== null && dayNumber(t.deadline) <= dayNumber(now) + 1;
}

/** Each Forage task's place, top first: tasks David has not placed yet go on top, newest
 *  first; the rest keep the order he dragged them into. A Map keeps that order. */
export function forageRanks(saved: string[], tasks: BoardTask[], now: Date): Map<string, number> {
  const forage = tasks.filter((t) => inForage(t, now));
  const ids = new Set(forage.map((t) => t.id));
  const placed: string[] = [];
  const seen = new Set<string>();
  for (const id of saved) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (ids.has(id)) placed.push(id);
  }
  const newcomers = forage
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((t) => t.id);
  return new Map([...newcomers, ...placed].map((id, index) => [id, index]));
}

/** Tasks in the order to show them: the Forage in David's order, then whatever is coming
 *  next by date (the deadline wins over the scheduled date), then undated ones. */
export function inForageOrder<T extends BoardTask>(tasks: T[], saved: string[], now: Date): T[] {
  const ranks = forageRanks(saved, tasks, now);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const top = [...ranks.keys()].map((id) => byId.get(id)!);
  const due = (t: BoardTask) => t.deadline ?? t.scheduledDate;
  const rest = tasks.filter((t) => !ranks.has(t.id));
  const dated = rest.filter((t) => due(t) !== null).sort((a, b) => due(a)!.getTime() - due(b)!.getTime());
  const undated = rest.filter((t) => due(t) === null);
  return [...top, ...dated, ...undated];
}

/** The board's page: the first few of that order, ready to draw. */
export function pageTasks(tasks: BoardTask[], saved: string[], now: Date, limit: number = LIMIT): PageTask[] {
  return inForageOrder(tasks, saved, now)
    .slice(0, limit)
    .map((t) => {
      const due = t.deadline ?? t.scheduledDate;
      return { title: shortTitle(t.name), due: dueLabel(due, now), due_abs: dueAbs(due, now) };
    });
}

/** The saved order to use: the most recent day that has one (today's, once the Daily page
 *  has been opened today; otherwise the last one, which is what the page itself carries over). */
export function latestSavedOrder(logs: { forageOrder: string }[]): string[] {
  for (const log of logs) {
    const order = parseForageOrder(log.forageOrder);
    if (order.length > 0) return order;
  }
  return [];
}
