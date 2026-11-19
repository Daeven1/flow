import { LENGTHS, type SavedSession } from "./session";

export const STORAGE_KEY = "grove-focus-session";

const OUTCOMES = ["COMPLETED", "CLEARED", "GAVE_UP", "LEFT"];
const RULES = ["STRICT", "GENTLE"];

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses what we saved to localStorage. Returns null on anything malformed. */
export function parseSaved(raw: string | null): SavedSession | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;

  if (!(v.id === null || typeof v.id === "string")) return null;
  if (!isNum(v.startedAt)) return null;
  if (!isNum(v.plannedMinutes) || !(LENGTHS as number[]).includes(v.plannedMinutes)) return null;
  if (typeof v.rule !== "string" || !RULES.includes(v.rule)) return null;
  if (!Array.isArray(v.taskIds) || !v.taskIds.every((t) => typeof t === "string")) return null;
  if (
    !Array.isArray(v.ticks) ||
    !v.ticks.every((t) => isObj(t) && typeof t.taskId === "string" && isNum(t.at))
  ) {
    return null;
  }
  if (!(v.hiddenAt === null || isNum(v.hiddenAt))) return null;

  let ended: SavedSession["ended"] = null;
  if (v.ended !== null) {
    const e = v.ended;
    if (
      !isObj(e) ||
      typeof e.outcome !== "string" ||
      !OUTCOMES.includes(e.outcome) ||
      !isNum(e.at) ||
      typeof e.synced !== "boolean"
    ) {
      return null;
    }
    ended = { outcome: e.outcome as NonNullable<SavedSession["ended"]>["outcome"], at: e.at, synced: e.synced };
  }

  return {
    id: v.id,
    startedAt: v.startedAt,
    plannedMinutes: v.plannedMinutes as SavedSession["plannedMinutes"],
    rule: v.rule as SavedSession["rule"],
    taskIds: v.taskIds as string[],
    ticks: (v.ticks as { taskId: string; at: number }[]).map((t) => ({ taskId: t.taskId, at: t.at })),
    hiddenAt: v.hiddenAt,
    ended,
  };
}
