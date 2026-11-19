# Focus Grove, piece 1: timer, sessions and focus rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Focus page gets a 20/25/30-minute session timer with the strict (phone) and gentle (browser) focus rules, a plain progress display, and session minutes recorded on the Time page.

**Architecture:** All timing and rule decisions are pure functions in `lib/focus/session.ts`, tested with Vitest. A client hook keeps the running session in `localStorage` (so it belongs to the device and survives reloads) and reports start and end to two new API routes backed by one new table. The 3D grove, plants, seeds and animals are later pieces; this piece leaves a single `progress` number (0 to 1) that piece 2 will draw as a plant.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 on Supabase Postgres, Tailwind 3, Vitest (new, dev only).

**Spec:** `docs/superpowers/specs/2026-11-19-focus-grove-design.md` (this plan covers build-order piece 1 only).

## Global Constraints

- Work on branch `focus-grove-timer`, cut from `main`. Never push to `main`; pushing `main` deploys to production.
- The new table must exist in the database before any deployment of this code. The database ports are unreachable from David's network: deliver the SQL as a file and stop for David to run it in the Supabase SQL Editor. Do not run `prisma db push` or `prisma migrate`.
- Every API route starts with `export const runtime = 'nodejs';` and scopes every query to the id from `getUser()` (`lib/auth.ts`).
- Session lengths are exactly 20, 25 and 30 minutes; 25 is preselected.
- Strict rule grace period is exactly 10 seconds.
- Strict is the default only on a touch device with a small screen: `(pointer: coarse)` and viewport width under 768 px.
- If the last task in the queue is ticked off before the timer ends, the session ends as finished. No minimum time. Tasks cannot be added mid-session.
- The clock is always computed from the stored start time, never by counting ticks.
- No `window.confirm` / `alert`. No new runtime dependencies in this piece.
- Works in light and dark themes, by keyboard, at WCAG AA contrast; honour `prefers-reduced-motion`.
- User-facing copy is plain and kind; a lost session is never scolded.

## Review Focus

1. **Reload or tab crash mid-session:** the session resumes with the right time left; under the strict rule the time the page was gone counts as time away. (Task 1 `judge` tests; Task 3 restore.)
2. **Laptop sleeps past the end under the gentle rule:** on return the session is finished, and minutes worked never exceed the planned length. (Task 1 tests.)
3. **Network fails when reporting the end:** the end screen still shows at once and the report is retried later, without creating duplicate time logs. (Task 2 idempotence; Task 3 retry.)
4. **Ticking a task fails or the task was deleted elsewhere:** the session carries on and the pile still advances. (Task 4.)
5. **Focus page opened while a session is already saved on this device:** it shows the running session instead of the queue builder. (Task 4.)

---

### Task 1: Session logic and test harness

**Files:**
- Create: `lib/focus/session.ts`, `lib/focus/session.test.ts`, `vitest.config.ts`
- Modify: `package.json` (add devDependency `vitest`, script `"test": "vitest run"`)

**Interfaces — Produces:**

```ts
export type FocusRule = "STRICT" | "GENTLE";
export type Outcome = "COMPLETED" | "CLEARED" | "GAVE_UP" | "LEFT";
export type PlannedMinutes = 20 | 25 | 30;
export type Tick = { taskId: string; at: number };            // ms epoch
export type Ended = { outcome: Outcome; at: number; synced: boolean };
export type SavedSession = {
  id: string | null;            // server id; null until the start call succeeds
  startedAt: number;            // ms epoch
  plannedMinutes: PlannedMinutes;
  rule: FocusRule;
  taskIds: string[];            // queue order
  ticks: Tick[];                // tasks ticked off, in order
  hiddenAt: number | null;      // when the page last became hidden, if still hidden
  ended: Ended | null;
};
export type Segment = { taskId: string; minutes: number };

export const GRACE_MS = 10_000;
export const LENGTHS: PlannedMinutes[] = [20, 25, 30];
export const DEFAULT_LENGTH: PlannedMinutes = 25;

export function endsAt(s: SavedSession): number;
export function remainingMs(s: SavedSession, now: number): number;   // clamped at 0
export function progress(s: SavedSession, now: number): number;      // 0..1
export function defaultRule(env: { coarsePointer: boolean; width: number }): FocusRule;
export function judge(s: SavedSession, now: number): { outcome: Outcome; at: number } | null;
export function segments(s: SavedSession, endedAt: number): Segment[];
export function formatClock(ms: number): string;                     // "24:07", rounds up to the second
```

`judge` rules, in this order: already `ended` returns it; `STRICT` with `hiddenAt` set, `hiddenAt < endsAt`, and `min(now, endsAt) - hiddenAt > GRACE_MS` returns `LEFT` at `hiddenAt + GRACE_MS`; every id in `taskIds` ticked returns `CLEARED` at the last tick's `at`; `now >= endsAt` returns `COMPLETED` at `endsAt`; otherwise `null`. `GAVE_UP` is never produced by `judge` (the hook sets it).

`segments`: walk the ticks in order; each ticked task gets the time since the previous tick (or the start). The first un-ticked task in queue order gets the time from the last tick to `endedAt`. `endedAt` is clamped to `endsAt`. Minutes are `Math.round(ms / 60000)`; drop entries with 0 minutes.

- [ ] **Step 1: Add Vitest.** `npm i -D vitest`; add the `test` script; `vitest.config.ts` with the `@` alias pointing at the repo root and `environment: "node"`.

- [ ] **Step 2: Write the failing tests** in `lib/focus/session.test.ts`. Use a helper `base(over?: Partial<SavedSession>)` returning a 25-minute GENTLE session started at `T0 = 1_800_000_000_000` with `taskIds: ["a","b"]`. Required cases (`MIN = 60_000`):

```ts
test("remaining and progress come from the start time", () => {
  expect(remainingMs(base(), T0 + 10 * MIN)).toBe(15 * MIN);
  expect(progress(base(), T0 + 10 * MIN)).toBeCloseTo(0.4);
  expect(remainingMs(base(), T0 + 99 * MIN)).toBe(0);
  expect(progress(base(), T0 + 99 * MIN)).toBe(1);
});
test("default rule is strict only on a small touch device", () => {
  expect(defaultRule({ coarsePointer: true, width: 390 })).toBe("STRICT");
  expect(defaultRule({ coarsePointer: true, width: 1024 })).toBe("GENTLE");
  expect(defaultRule({ coarsePointer: false, width: 390 })).toBe("GENTLE");
});
test("running session is not judged", () => {
  expect(judge(base(), T0 + 5 * MIN)).toBeNull();
});
test("gentle: hidden for a long time changes nothing", () => {
  expect(judge(base({ hiddenAt: T0 + MIN }), T0 + 20 * MIN)).toBeNull();
});
test("gentle: back after the end is completed at the end time", () => {
  expect(judge(base({ hiddenAt: T0 + MIN }), T0 + 3 * 60 * MIN))
    .toEqual({ outcome: "COMPLETED", at: T0 + 25 * MIN });
});
test("strict: away within the grace period is forgiven", () => {
  expect(judge(base({ rule: "STRICT", hiddenAt: T0 + MIN }), T0 + MIN + 10_000)).toBeNull();
});
test("strict: away past the grace period loses the session", () => {
  expect(judge(base({ rule: "STRICT", hiddenAt: T0 + MIN }), T0 + MIN + 10_001))
    .toEqual({ outcome: "LEFT", at: T0 + MIN + 10_000 });
});
test("strict: hidden in the last few seconds still completes", () => {
  expect(judge(base({ rule: "STRICT", hiddenAt: T0 + 25 * MIN - 5_000 }), T0 + 60 * MIN))
    .toEqual({ outcome: "COMPLETED", at: T0 + 25 * MIN });
});
test("ticking every task clears the session early", () => {
  const s = base({ ticks: [{ taskId: "a", at: T0 + 4 * MIN }, { taskId: "b", at: T0 + 9 * MIN }] });
  expect(judge(s, T0 + 9 * MIN)).toEqual({ outcome: "CLEARED", at: T0 + 9 * MIN });
});
test("an ended session keeps its outcome", () => {
  const s = base({ ended: { outcome: "GAVE_UP", at: T0 + 2 * MIN, synced: false } });
  expect(judge(s, T0 + 60 * MIN)).toEqual({ outcome: "GAVE_UP", at: T0 + 2 * MIN });
});
test("segments split minutes by task and never exceed the plan", () => {
  const s = base({ ticks: [{ taskId: "a", at: T0 + 10 * MIN }] });
  expect(segments(s, T0 + 3 * 60 * MIN)).toEqual([
    { taskId: "a", minutes: 10 }, { taskId: "b", minutes: 15 },
  ]);
});
test("segments drop tasks that got no time", () => {
  const s = base({ ticks: [{ taskId: "a", at: T0 + 10_000 }, { taskId: "b", at: T0 + 9 * MIN }] });
  expect(segments(s, T0 + 9 * MIN)).toEqual([{ taskId: "b", minutes: 9 }]);
});
test("clock text", () => {
  expect(formatClock(24 * MIN + 6_200)).toBe("24:07");
  expect(formatClock(0)).toBe("0:00");
});
```

- [ ] **Step 3: Run** `npm test`. Expected: FAIL, module `./session` not found.
- [ ] **Step 4: Implement `lib/focus/session.ts`** to the interface and rules above. No imports from React, Next or the DOM.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(focus): session timing and focus-rule logic with tests`.

---

### Task 2: FocusSession table and API

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261119000000_add_focus_session/migration.sql`
- Create: `app/api/focus/sessions/route.ts`, `app/api/focus/sessions/[id]/route.ts`
- Create: `lib/focus/validate.ts`, `lib/focus/validate.test.ts`

**Interfaces:**
- Consumes: `Outcome`, `FocusRule`, `Segment`, `LENGTHS` from Task 1.
- Produces:
  - `POST /api/focus/sessions` body `{ startedAt: string (ISO), plannedMinutes: 20|25|30, rule: "STRICT"|"GENTLE", taskIds: string[] }` → `201 { id: string }`; `400` on invalid body; `401` unsigned.
  - `PATCH /api/focus/sessions/[id]` body `{ outcome: Outcome, endedAt: string (ISO), segments: Segment[] }` → `200 { ok: true }`; `404` if not the user's; `400` invalid.
  - `parseStart(body: unknown): StartInput | null` and `parseEnd(body: unknown, plannedMinutes: number): EndInput | null` in `lib/focus/validate.ts`.

Model (also the SQL, as `CREATE TABLE "FocusSession"` plus `CREATE INDEX "FocusSession_userId_idx"`; plain SQL in the style of the existing migration folders, nothing else in the file):

```prisma
model FocusSession {
  id             String    @id @default(cuid())
  userId         String
  startedAt      DateTime
  plannedMinutes Int
  rule           String
  taskIds        String    // JSON string[] in queue order
  outcome        String?   // null while running
  endedAt        DateTime?
  createdAt      DateTime  @default(now())

  @@index([userId])
}
```

`parseEnd` rules: `outcome` is one of the four; `endedAt` parses as a date; each segment has a non-empty `taskId` and an integer `minutes` clamped to `0..plannedMinutes`; if the total exceeds `plannedMinutes`, return `null`.

PATCH behaviour: load the session by `id` and `userId`. If `outcome` is already set, return `200 { ok: true }` and change nothing (the client may retry). Otherwise, in one transaction: set `outcome` and `endedAt`; and only when the outcome is `COMPLETED` or `CLEARED`, for each segment whose task belongs to this user, create a `TimeLog` (`taskName`, `sprint`, `estMinutes` read from the task; `actualMinutes` = segment minutes) and increment that task's `actualMinutes` by the segment minutes (treat null as 0). Skip segments for tasks that no longer exist.

- [ ] **Step 1: Write failing tests** `lib/focus/validate.test.ts`:

```ts
test("parseStart accepts a valid body", () => {
  expect(parseStart({ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] }))
    .toEqual({ startedAt: new Date("2026-11-19T02:00:00.000Z"), plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] });
});
test.each([
  [{ startedAt: "nope", plannedMinutes: 25, rule: "STRICT", taskIds: ["a"] }],
  [{ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 45, rule: "STRICT", taskIds: ["a"] }],
  [{ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "LOOSE", taskIds: ["a"] }],
  [{ startedAt: "2026-11-19T02:00:00.000Z", plannedMinutes: 25, rule: "STRICT", taskIds: [] }],
  [null],
])("parseStart rejects %j", (body) => expect(parseStart(body)).toBeNull());
test("parseEnd clamps and totals", () => {
  const ok = parseEnd({ outcome: "CLEARED", endedAt: "2026-11-19T02:09:00.000Z", segments: [{ taskId: "a", minutes: 9 }] }, 25);
  expect(ok?.segments).toEqual([{ taskId: "a", minutes: 9 }]);
  expect(parseEnd({ outcome: "COMPLETED", endedAt: "2026-11-19T02:25:00.000Z",
    segments: [{ taskId: "a", minutes: 20 }, { taskId: "b", minutes: 20 }] }, 25)).toBeNull();
  expect(parseEnd({ outcome: "WON", endedAt: "2026-11-19T02:25:00.000Z", segments: [] }, 25)).toBeNull();
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, `./validate` not found.
- [ ] **Step 3: Implement `lib/focus/validate.ts`.** Run `npm test`. Expected: pass.
- [ ] **Step 4: Add the model to `prisma/schema.prisma` and write the SQL file.** Run `npx prisma generate` (needs no database). Expected: client generated.
- [ ] **Step 5: Implement both routes** as specified, following the shape of `app/api/timelogs/route.ts`.
- [ ] **Step 6: Run** `npx tsc --noEmit` and `npm test`. Expected: no errors, all pass.
- [ ] **Step 7: Commit** `feat(focus): FocusSession table and start/end API`.

---

### Task 3: The session hook

**Files:**
- Create: `lib/focus/useFocusSession.ts`, `lib/focus/storage.ts`, `lib/focus/storage.test.ts`

**Interfaces:**
- Consumes: everything from Task 1; the two routes from Task 2.
- Produces:

```ts
// storage.ts
export const STORAGE_KEY = "grove-focus-session";
export function parseSaved(raw: string | null): SavedSession | null;   // null on anything malformed

// useFocusSession.ts
export type FocusSessionApi = {
  ready: boolean;                       // false until localStorage has been read
  session: SavedSession | null;
  now: number;                          // ticks about once a second while running
  wakeLockOk: boolean | null;           // null = not requested; false = unsupported or refused
  start(input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[] }): void;
  tick(taskId: string): void;           // records the tick; ends as CLEARED if it was the last
  giveUp(): void;                       // ends as GAVE_UP
  clear(): void;                        // forget an ended session
};
export function useFocusSession(): FocusSessionApi;
```

Behaviour:
- Every change to the session is written to `localStorage[STORAGE_KEY]`; `clear()` removes it.
- On mount: read storage, then run `judge(saved, Date.now())` and apply the result. This is what makes a reload count as time away under the strict rule.
- `visibilitychange` and `pagehide`: when hidden, set `hiddenAt = Date.now()` and save; when visible, run `judge`, apply it, then set `hiddenAt = null`.
- While running, an interval of 1000 ms updates `now` and applies `judge`.
- Under the strict rule, request `navigator.wakeLock.request("screen")` at start and again each time the page becomes visible; release on end. If unsupported or rejected set `wakeLockOk = false` and carry on.
- Server calls never block the screen. `start` POSTs and stores the returned `id`. When the session has `ended` with `synced: false` and an `id`, PATCH with `segments(session, ended.at)`, then set `synced: true`. Retry on mount, when the page becomes visible, and on the `online` event. If the start POST failed (`id` still null) retry it first.

- [ ] **Step 1: Write failing tests** `lib/focus/storage.test.ts`: `parseSaved(null)`, `parseSaved("{")`, `parseSaved('{"startedAt":"x"}')` and a session whose `plannedMinutes` is 45 all return `null`; a valid `JSON.stringify`'d `SavedSession` round-trips with `toEqual`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement `storage.ts`**, then `useFocusSession.ts` (`"use client"`). Keep every decision inside `judge`/`segments`; the hook only wires events.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: pass, no errors.
- [ ] **Step 5: Commit** `feat(focus): device-bound session hook with visibility and wake lock`.

---

### Task 4: Focus page session screens

**Files:**
- Create: `components/focus/SessionSetup.tsx`, `components/focus/SessionView.tsx`, `components/focus/SessionEnd.tsx`
- Modify: `components/StickyPile.tsx`, `app/focus/page.tsx`

**Interfaces:**
- Consumes: `useFocusSession`, `progress`, `remainingMs`, `formatClock`, `defaultRule`, `LENGTHS`, `DEFAULT_LENGTH`.
- Produces (for piece 2): `SessionView` renders its visual through one slot, `<FocusVisual progress={number} outcome={Outcome | null} />`, defined in `SessionView.tsx` for now as a plain bar. Piece 2 replaces only that component.

`StickyPile` changes: new optional props `initialIndex?: number` (start position, for resume) and `onCleared?: () => void` (called once when the last note is ticked, instead of showing its own "All done" screen when the prop is given). Existing behaviour without the props is unchanged.

Flow in `app/focus/page.tsx`:
1. `ready` false: the existing loading line.
2. A saved session exists and has not ended: `SessionView`, even if the queue is empty (Review Focus 5). Task names for the saved `taskIds` come from the fetched task list; a missing task shows as "A task that's no longer on your list" and can still be ticked.
3. A saved session has ended: `SessionEnd`.
4. Otherwise the existing queue builder. Its button, now labelled "Choose session →", opens `SessionSetup` in place of the right-hand panel's button area.

`SessionSetup`: three length buttons (`LENGTHS`, `DEFAULT_LENGTH` selected, `aria-pressed`); a two-way switch between the rules preset by `defaultRule({ coarsePointer: matchMedia("(pointer: coarse)").matches, width: innerWidth })`, with one line under it:
- Strict: "If you leave Grove for more than 10 seconds, this session is lost. Keep your phone open and, ideally, plugged in."
- Gentle: "The session only ends early if you give up."
Then "Start focusing" which calls `start` with the queue's ids.

`SessionView`: `FocusVisual`; the time left as `formatClock(remainingMs(...))` in small text with `aria-live="off"` plus a visually hidden line updated once a minute for screen readers; the `StickyPile` for the un-ticked tasks (`initialIndex` = number of ticks); a "Give up" button that turns into "Really give up? This session will be lost." with "Yes, give up" and "Keep going" (no dialogs). When `wakeLockOk === false` under the strict rule, show "This phone can't be kept awake from here, so keep the screen from locking yourself." `StickyPile.onComplete` calls the existing `completeTask` (do not await it; on failure the pile still advances) and then `tick(taskId)`.

`SessionEnd` copy by outcome, each with a "New session" button calling `clear()`:
- `COMPLETED`: "Session complete. {n} minutes of focus."
- `CLEARED`: "List cleared in {n} minutes. Nicely done."
- `LEFT`: "You stepped away from Grove, so this session didn't count. Everything else is just as you left it."
- `GAVE_UP`: "Session ended early. Nothing else has changed."
For `COMPLETED` and `CLEARED` also offer "Take a 5-minute break": a plain countdown held in component state with a "Skip" button; nothing happens when it runs out except the text "Break's over whenever you're ready."

- [ ] **Step 1: Change `StickyPile`** as above.
- [ ] **Step 2: Build the three components**, styled with the classes already used on the Focus page (cards `bg-white dark:bg-zinc-900 border ... rounded-xl`, primary button `bg-slate-900 dark:bg-white ...`). The bar's fill transition is removed under `motion-reduce:`.
- [ ] **Step 3: Wire `app/focus/page.tsx`** to the four-state flow. Update the header subtitle to "Pick your tasks, choose a session, and stay with it".
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. Expected: all clean (the build needs no database).
- [ ] **Step 5: Commit** `feat(focus): session setup, timer view and end screens on the Focus page`.

---

### Task 5: Hand-over for the database step and live check

The local app cannot reach the database from David's school network, so the click-through happens on a Vercel preview.

- [ ] **Step 1:** Stop and give David the contents of `prisma/migrations/20261119000000_add_focus_session/migration.sql` to run in the Supabase SQL Editor. It only adds a new empty table, so the live app is unaffected. Wait for his confirmation.
- [ ] **Step 2:** With his go-ahead, push branch `focus-grove-timer` (a preview deployment, not production) and open the preview's `/focus`.
- [ ] **Step 3:** Check on the preview, at desktop and phone widths, light and dark: start a 20-minute gentle session, reload mid-session (time left is right), tick a single-task queue (ends as "List cleared", a new row appears on `/time`), give up a session (no time logged), and at phone width under the strict rule hide the tab for 15 seconds (session lost) and for 5 seconds (session continues).
- [ ] **Step 4:** Report results to David with screenshots. Merging to `main` is his call. Update the Obsidian note named in `CLAUDE.md` with a dated work-log entry.
