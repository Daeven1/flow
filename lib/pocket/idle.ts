// What a pocket e-paper board shows when nobody is talking: its owner's next few tasks.
//
// At home the board gets this page from JARVIS on the Mac mini (jarvis/pocket/idle.py in
// the jarvis repo). Away from home it cannot reach the mini's home address, so it asks
// Grove directly. This file holds the labels and title rules, the same as the mini's, and
// forage.ts holds which tasks and in what order: the board draws whatever it is sent, with
// no dates or sorting of its own.

import { timingSafeEqual } from "crypto";

export const LIMIT = 3; // tasks on the page
export const TITLE_CHARS = 80; // the board wraps a title to two lines and cuts what is left
export const NO_TITLE = "(untitled)"; // nothing drawable left, e.g. a title written in Chinese
const ZONE = "Asia/Shanghai";

export type PageTask = { title: string; due: string | null; due_abs: string | null };

// The calendar date in Shanghai, as a day count. Grove keeps a date-only value at UTC
// midnight, which is 08:00 the same day in Shanghai, so those keep their own date.
export function dayNumber(moment: Date): number {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(moment);
  const [year, month, day] = ymd.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function part(moment: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, ...options }).format(moment);
}

/** When a task is due, in a word: "overdue", "today", "tomorrow", "Fri", "26 Nov". */
export function dueLabel(due: Date | null, now: Date): string | null {
  if (due === null) return null;
  const days = dayNumber(due) - dayNumber(now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return part(due, { weekday: "short" });
  // A week out, a weekday alone would mislead.
  return `${part(due, { day: "numeric" })} ${part(due, { month: "short" })}`;
}

/** The same day as a date, "Thu 19 Nov": a board that has switched itself off keeps its
 *  last page on the glass for hours, and "today" goes stale there. */
export function dueAbs(due: Date | null, _now: Date): string | null {
  if (due === null) return null;
  return `${part(due, { weekday: "short" })} ${part(due, { day: "numeric" })} ${part(due, { month: "short" })}`;
}

// What the firmware's fonts can draw: Basic Latin, Latin-1, and a few typographic marks.
// Anything else would show as a hole, so it is left out here.
const EXTRA = new Set("–—‘’“”…°€");
function drawable(char: string): boolean {
  const code = char.codePointAt(0)!;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.has(char) || /\s/.test(char);
}

export function shortTitle(title: string): string {
  const clean = Array.from(title).filter(drawable).join("").split(/\s+/).filter(Boolean).join(" ");
  if (!clean) return NO_TITLE;
  if (clean.length <= TITLE_CHARS) return clean;
  const cut = clean.slice(0, TITLE_CHARS - 1);
  const atWord = cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
  return atWord.replace(/[,;:-]+$/, "") + "…";
}

/** The board this request is from, or null. POCKET_BOARDS is JSON:
 *  {"<mac>": {"token": "...", "email": "<grove account>", "owner": "<name on the page>"}}.
 *  Both the board's id and its own token are needed; the token is compared in constant time. */
export function boardFor(
  raw: string | undefined,
  deviceId: string | null,
  authorization: string | null,
): { email: string; owner: string } | null {
  if (!raw || !deviceId || !authorization) return null;
  let boards: Record<string, { token?: string; email?: string; owner?: string }>;
  try {
    boards = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof boards !== "object" || boards === null) return null;
  const wanted = deviceId.trim().toLowerCase();
  const entry = Object.entries(boards).find(([id]) => id.toLowerCase() === wanted)?.[1];
  if (!entry || !entry.token || !entry.email) return null;
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${entry.token}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { email: entry.email.toLowerCase(), owner: entry.owner ?? "" };
}
