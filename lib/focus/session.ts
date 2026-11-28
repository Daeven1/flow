import type { PlantChoice } from "@/lib/grove/layout";

// Pure timing and focus-rule logic for the Focus page. No React, Next or DOM.

export type FocusRule = "STRICT" | "GENTLE";
export type Outcome = "COMPLETED" | "CLEARED" | "GAVE_UP" | "LEFT";
export type PlannedMinutes = 20 | 25 | 30;
export type Tick = { taskId: string; at: number }; // ms epoch
export type Ended = { outcome: Outcome; at: number; synced: boolean };
export type SavedSession = {
  id: string | null; // server id; null until the start call succeeds
  startedAt: number; // ms epoch
  plannedMinutes: PlannedMinutes;
  rule: FocusRule;
  taskIds: string[]; // queue order
  ticks: Tick[]; // tasks ticked off, in order
  hiddenAt: number | null; // when the page last became hidden, if still hidden
  ended: Ended | null;
  breakEndsAt?: number; // local deadline for the optional break after a successful session
  plant: SavedPlant | null; // the plant this session grows, if one was chosen
  plantDropped?: PlantDropped; // the server turned the plant down at start, so this is a plain session
};
/** A session's plant choice; a tend also keeps the stage its tree grows into (fixed at start). */
export type SavedPlant = PlantChoice & { stage?: number };
/** Why the server dropped a session's plant: not enough seeds, a tree that can't be tended, or a server error. */
export type PlantDropped = "SEEDS" | "TEND" | "ERROR";
export type Segment = { taskId: string; minutes: number };

export const GRACE_MS = 10_000;
export const BREAK_MS = 5 * 60_000;
export const LENGTHS: PlannedMinutes[] = [20, 25, 30];
export const DEFAULT_LENGTH: PlannedMinutes = 25;

const MIN_MS = 60_000;

export function endsAt(s: SavedSession): number {
  return s.startedAt + s.plannedMinutes * MIN_MS;
}

export function remainingMs(s: SavedSession, now: number): number {
  return Math.max(0, endsAt(s) - now);
}

export function progress(s: SavedSession, now: number): number {
  const total = s.plannedMinutes * MIN_MS;
  return Math.min(1, Math.max(0, (now - s.startedAt) / total));
}

export function defaultRule(env: { coarsePointer: boolean; width: number }): FocusRule {
  return env.coarsePointer && env.width < 768 ? "STRICT" : "GENTLE";
}

export function judge(
  s: SavedSession,
  now: number,
): { outcome: Outcome; at: number } | null {
  if (s.ended) return { outcome: s.ended.outcome, at: s.ended.at };

  const end = endsAt(s);

  if (
    s.rule === "STRICT" &&
    s.hiddenAt !== null &&
    s.hiddenAt < end &&
    Math.min(now, end) - s.hiddenAt > GRACE_MS
  ) {
    return { outcome: "LEFT", at: s.hiddenAt + GRACE_MS };
  }

  if (s.taskIds.length > 0) {
    const ticked = new Set(s.ticks.map((t) => t.taskId));
    if (s.taskIds.every((id) => ticked.has(id))) {
      return { outcome: "CLEARED", at: s.ticks[s.ticks.length - 1].at };
    }
  }

  if (now >= end) return { outcome: "COMPLETED", at: end };

  return null;
}

export function segments(s: SavedSession, endedAt: number): Segment[] {
  const end = Math.min(endedAt, endsAt(s));
  const out: Segment[] = [];
  // Round cumulative boundaries, not each piece, so the pieces add up to
  // round(total) and can never exceed the planned length.
  let prevMin = 0;
  const take = (taskId: string, boundary: number) => {
    const cum = Math.max(prevMin, toMinutes(Math.min(boundary, end) - s.startedAt));
    out.push({ taskId, minutes: cum - prevMin });
    prevMin = cum;
  };

  for (const t of s.ticks) take(t.taskId, t.at);

  const ticked = new Set(s.ticks.map((t) => t.taskId));
  const next = s.taskIds.find((id) => !ticked.has(id));
  if (next !== undefined) take(next, end);

  return out.filter((seg) => seg.minutes > 0);
}

function toMinutes(ms: number): number {
  return Math.round(Math.max(0, ms) / MIN_MS);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
