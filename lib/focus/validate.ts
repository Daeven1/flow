import { LENGTHS } from "./session";
import { parsePlantChoice } from "@/lib/grove/layout";
import type { PlantChoice } from "@/lib/grove/layout";
import type { FocusRule, Outcome, PlannedMinutes, Segment } from "./session";

export type StartInput = {
  startedAt: Date;
  plannedMinutes: PlannedMinutes;
  rule: FocusRule;
  taskIds: string[];
  plant: PlantChoice | null;
};
export type EndInput = { outcome: Outcome; endedAt: Date; segments: Segment[] };

const RULES: FocusRule[] = ["STRICT", "GENTLE"];
const OUTCOMES: Outcome[] = ["COMPLETED", "CLEARED", "GAVE_UP", "LEFT"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseStart(body: unknown): StartInput | null {
  if (!isObject(body)) return null;
  const startedAt = parseDate(body.startedAt);
  if (!startedAt) return null;
  const plannedMinutes = LENGTHS.find((l) => l === body.plannedMinutes);
  if (plannedMinutes === undefined) return null;
  const rule = RULES.find((r) => r === body.rule);
  if (!rule) return null;
  const ids = body.taskIds;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (!ids.every((id) => typeof id === "string" && id.length > 0)) return null;
  return { startedAt, plannedMinutes, rule, taskIds: ids as string[], plant: parsePlantChoice(body.plant) };
}

export function parseEnd(body: unknown, plannedMinutes: number): EndInput | null {
  if (!isObject(body)) return null;
  const outcome = OUTCOMES.find((o) => o === body.outcome);
  if (!outcome) return null;
  const endedAt = parseDate(body.endedAt);
  if (!endedAt) return null;
  if (!Array.isArray(body.segments)) return null;
  const segments: Segment[] = [];
  let total = 0;
  for (const s of body.segments) {
    if (!isObject(s)) return null;
    if (typeof s.taskId !== "string" || s.taskId.length === 0) return null;
    if (typeof s.minutes !== "number" || !Number.isInteger(s.minutes)) return null;
    const minutes = Math.min(plannedMinutes, Math.max(0, s.minutes));
    total += minutes;
    segments.push({ taskId: s.taskId, minutes });
  }
  // Safety net: trim any overflow from the last segments backwards.
  let over = total - plannedMinutes;
  for (let i = segments.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(segments[i].minutes, over);
    segments[i] = { ...segments[i], minutes: segments[i].minutes - cut };
    over -= cut;
  }
  return { outcome, endedAt, segments };
}
