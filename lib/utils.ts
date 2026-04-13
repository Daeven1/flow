import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInCalendarDays, startOfDay, addDays, format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type UrgencyLabel =
  | "Past due"
  | "Due today"
  | "Due tomorrow"
  | "Start soon"
  | "On track"
  | "No date";

export function getUrgencyLabel(deadline: Date | string | null | undefined): UrgencyLabel {
  if (!deadline) return "No date";
  const due = startOfDay(new Date(deadline));
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(due, today);
  if (diff < 0) return "Past due";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 3) return "Start soon";
  return "On track";
}

export const URGENCY_ORDER: UrgencyLabel[] = [
  "Past due",
  "Due today",
  "Due tomorrow",
  "Start soon",
  "On track",
  "No date",
];

export function urgencySort(
  a: { deadline?: Date | string | null; scheduledDate?: Date | string | null },
  b: { deadline?: Date | string | null; scheduledDate?: Date | string | null }
) {
  // Sort by scheduledDate proximity first, then deadline urgency
  const today = startOfDay(new Date());

  const aSched = a.scheduledDate ? startOfDay(new Date(a.scheduledDate)) : null;
  const bSched = b.scheduledDate ? startOfDay(new Date(b.scheduledDate)) : null;

  const aDiff = aSched ? differenceInCalendarDays(aSched, today) : 9999;
  const bDiff = bSched ? differenceInCalendarDays(bSched, today) : 9999;

  if (aDiff !== bDiff) return aDiff - bDiff;

  // Break ties by deadline urgency
  const labelA = getUrgencyLabel(a.deadline);
  const labelB = getUrgencyLabel(b.deadline);
  return URGENCY_ORDER.indexOf(labelA) - URGENCY_ORDER.indexOf(labelB);
}

export const SPRINT_COLORS: Record<number, string> = {
  1: "#E24B4A",
  2: "#BA7517",
  3: "#378ADD",
  4: "#7F77DD",
};

export const SPRINT_LABELS: Record<number, string> = {
  1: "S1 Urgent",
  2: "S2 Deadlines",
  3: "S3 Admin",
  4: "S4 Deep Work",
};

export const SPRINT_CAPACITY = 120; // minutes

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format a date as a human-friendly relative label */
export function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = startOfDay(new Date(date));
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(d, today);
  if (diff < -1) return `${Math.abs(diff)}d ago`;
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 6) return format(d, "EEEE"); // "Monday", "Tuesday", etc.
  return format(d, "d MMM");
}

/**
 * Compute the ideal scheduledDate for a task given its deadline, work category,
 * estimated time, and the user's configured work-night days.
 *
 * GRADING tasks → last work-night (e.g. Monday) on or before deadline
 * STANDARD tasks → weekday buffer before deadline based on estMinutes
 */
export function computeScheduledDate(
  deadline: Date | string,
  workCategory: string,
  estMinutes: number,
  workNightDays: number[] = [1] // 0=Sun, 1=Mon, ... 6=Sat
): Date {
  const deadlineDay = startOfDay(new Date(deadline));
  const today = startOfDay(new Date());

  if (workCategory === "GRADING") {
    // Walk back from deadline to find the most recent work-night
    for (let i = 0; i <= 21; i++) {
      const candidate = addDays(deadlineDay, -i);
      if (workNightDays.includes(candidate.getDay())) {
        return candidate >= today ? candidate : today;
      }
    }
    return deadlineDay; // fallback: use deadline itself
  } else {
    // Buffer: 1 day for ≤30m, 2 days for ≤90m, 3 days for >90m
    const bufferDays = estMinutes <= 30 ? 1 : estMinutes <= 90 ? 2 : 3;
    let scheduled = addDays(deadlineDay, -bufferDays);
    // Skip backwards past weekends
    while (scheduled.getDay() === 0 || scheduled.getDay() === 6) {
      scheduled = addDays(scheduled, -1);
    }
    return scheduled >= today ? scheduled : today;
  }
}
