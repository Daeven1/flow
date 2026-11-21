import { MAX_STAGE, parsePlantChoice } from "@/lib/grove/layout";
import { LENGTHS, type SavedPlant, type SavedSession } from "./session";

export const STORAGE_KEY = "grove-focus-session";
export const PENDING_KEY = "grove-focus-pending";

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
  return validate(v);
}

/** The ended sessions still waiting to reach the server. Malformed entries are dropped. */
export function parsePending(raw: string | null): SavedSession[] {
  if (!raw) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: SavedSession[] = [];
  for (const entry of v) {
    const s = validate(entry);
    if (s) out.push(s);
  }
  return out;
}

function validate(v: unknown): SavedSession | null {
  if (!isObj(v)) return null;

  if (!(v.id === null || (typeof v.id === "string" && v.id.length > 0))) return null;
  if (!isNum(v.startedAt)) return null;
  if (!isNum(v.plannedMinutes) || !(LENGTHS as number[]).includes(v.plannedMinutes)) return null;
  if (typeof v.rule !== "string" || !RULES.includes(v.rule)) return null;
  if (!Array.isArray(v.taskIds) || v.taskIds.length === 0 || !v.taskIds.every((t) => typeof t === "string")) return null;
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

  const out: SavedSession = {
    id: v.id,
    startedAt: v.startedAt,
    plannedMinutes: v.plannedMinutes as SavedSession["plannedMinutes"],
    rule: v.rule as SavedSession["rule"],
    taskIds: v.taskIds as string[],
    ticks: (v.ticks as { taskId: string; at: number }[]).map((t) => ({ taskId: t.taskId, at: t.at })),
    hiddenAt: v.hiddenAt,
    ended,
    plant: parsePlant(v.plant),
  };
  if (v.plantDropped === "SEEDS" || v.plantDropped === "TEND") out.plantDropped = v.plantDropped;
  return out;
}

/** A saved plant choice; a tend's stage is kept only when it is one a tree can grow into. */
function parsePlant(v: unknown): SavedPlant | null {
  const choice = parsePlantChoice(v);
  if (!choice || choice.tendId === undefined || !isObj(v)) return choice;
  const stage = v.stage;
  if (typeof stage === "number" && Number.isInteger(stage) && stage >= 2 && stage <= MAX_STAGE) {
    return { ...choice, stage };
  }
  return choice;
}

/** Should a failed server call be tried again later? Most 4xx never will succeed. */
export function shouldRetry(status: number): boolean {
  return status === 401 || status === 429 || status >= 500;
}
