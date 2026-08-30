# Student Mode UX Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Grove's Student Mode use student-appropriate wording instead of leaked teacher jargon ("Prep period" / "Work night" / "S3 Admin"), and hide the Sprints and Templates nav sections from students, without changing anything about Teacher mode.

**Architecture:** Add one new client-side React Context (`UserModeProvider`) that fetches `UserSettings.userMode` once via the existing `GET /api/settings` endpoint and exposes it app-wide. Add pure label-lookup helpers to `lib/utils.ts` that take `userMode` and return the right string. Every component that currently renders a hardcoded teacher-flavored label reads `userMode` from the new context and calls the helper instead. `components/SprintBadge.tsx` becomes mode-aware internally, which fixes most read-only sprint badges across the app (Tasks, Sprints, Projects, Project Detail, Daily, Focus, Time, Review, Calendar) without touching those files. `components/Nav.tsx` filters its nav items by `userMode`.

**Tech Stack:** Next.js 16 App Router, React Context, TypeScript. No new dependencies. No test framework exists in this repo (confirmed: no `test` script in `package.json`, no test files) — verification is `npx tsc --noEmit` after every task plus a manual check via the dev server for the two interactive tasks (Nav filtering, Settings mode switch).

**Spec:** No separate spec file — this plan implements the two changes the user asked for directly: (1) "fix the labels to make more sense to students," scoped by an earlier audit to the `workCategory` ("Prep period"/"Work night") and `SPRINT_LABELS` ("S3 Admin") strings; (2) "remove the sprints and templates sections for them" (Student Mode only).

## Global Constraints

- **Teacher mode must not change at all.** Every new code path is `userMode === "STUDENT"` conditional; the `TEACHER` branch of every new helper must return exactly the string that exists in the code today, character-for-character (including emoji).
- **No test framework exists.** Do not invent one. Verify each task with `npx tsc --noEmit` (must show no errors introduced by the task's files) and, for Tasks 4 and 6 specifically, a manual check in the running dev server.
- **`getUser()` (`lib/auth.ts`) is documented "for API route handlers only, not server components."** Do not call it from `app/layout.tsx` or any Server Component. This is why mode is fetched client-side (accepting a brief flash-of-teacher-content on cold load) rather than injected via SSR — do not try to "fix" this by making the layout async and fetching there.
- **Routes for `/sprints` and `/templates` stay reachable by direct URL for students.** This plan only removes them from `components/Nav.tsx`'s link list. Do not add redirects or route guards — out of scope, not requested.
- **`app/sprints/page.tsx` itself is explicitly left untouched** (still shows "S3 Admin" etc. if a student navigates there directly). It's being removed from student nav in this same plan, so relabeling a page students are being steered away from is not worth the added surface area. Do not add a task for it.
- Already on feature branch `student-mode-ux-cleanup`. Commit after each task. Do not push to `main` — stop before pushing per this session's agreed plan (branch review before it reaches `main`, which auto-deploys to production).
- One unrelated file (`app/api/templates/route.ts`) already has an uncommitted fix from earlier in this session (reset-to-defaults mode-awareness bug). Leave it as-is; it will be committed as part of Task 1's commit (first task to touch git) with its own clear message, or committed separately if the executor prefers — either is fine, just don't lose it.

---

### Task 1: `UserModeProvider` context

**Files:**
- Create: `components/UserModeProvider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `UserModeProvider` (component, wraps children), `useUserMode(): { userMode: "TEACHER" | "STUDENT"; loading: boolean; refresh: () => Promise<void> }`, and the exported type `UserMode = "TEACHER" | "STUDENT"`. Every later task imports `useUserMode` from `@/components/UserModeProvider`.

- [ ] **Step 1: Create the provider**

```tsx
// components/UserModeProvider.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UserMode = "TEACHER" | "STUDENT";

interface UserModeContextValue {
  userMode: UserMode;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserModeContext = createContext<UserModeContextValue | null>(null);

export function useUserMode(): UserModeContextValue {
  const ctx = useContext(UserModeContext);
  if (!ctx) throw new Error("useUserMode must be used inside UserModeProvider");
  return ctx;
}

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [userMode, setUserMode] = useState<UserMode>("TEACHER");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setUserMode(data.userMode === "STUDENT" ? "STUDENT" : "TEACHER");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UserModeContext.Provider value={{ userMode, loading, refresh }}>
      {children}
    </UserModeContext.Provider>
  );
}
```

- [ ] **Step 2: Wire it into the root layout**

In `app/layout.tsx`, add the import and wrap the existing `ModeProvider` (order relative to `ModeProvider` doesn't matter — they're independent contexts):

```tsx
import { ModeProvider } from "@/components/ModeProvider";
```
becomes
```tsx
import { ModeProvider } from "@/components/ModeProvider";
import { UserModeProvider } from "@/components/UserModeProvider";
```

And:
```tsx
        <ModeProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        </ModeProvider>
```
becomes
```tsx
        <UserModeProvider>
          <ModeProvider>
            <Nav />
            <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
          </ModeProvider>
        </UserModeProvider>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (there will likely be pre-existing errors/warnings unrelated to this file; confirm none reference `UserModeProvider.tsx` or `app/layout.tsx`).

- [ ] **Step 4: Commit**

```bash
git add components/UserModeProvider.tsx app/layout.tsx app/api/templates/route.ts
git commit -m "feat: add UserModeProvider context for client-side student/teacher mode"
```

---

### Task 2: Mode-aware label helpers

**Files:**
- Modify: `lib/utils.ts`

**Interfaces:**
- Consumes: `UserMode` type from `@/components/UserModeProvider` (Task 1).
- Produces: `STUDENT_SPRINT_LABELS: Record<number, string>`, `getSprintLabels(userMode: UserMode): Record<number, string>`, `getWorkCategoryLabel(workCategory: string, userMode: UserMode, variant?: "full" | "short"): string`. Every consumer task (3, 4 excluded, 5 excluded, 6–12) imports these from `@/lib/utils`.

- [ ] **Step 1: Add the helpers below the existing `SPRINT_LABELS` constant**

In `lib/utils.ts`, the existing block is:

```ts
export const SPRINT_LABELS: Record<number, string> = {
  1: "S1 Urgent",
  2: "S2 Deadlines",
  3: "S3 Admin",
  4: "S4 Deep Work",
};

export const SPRINT_CAPACITY = 120; // minutes
```

Change it to:

```ts
export const SPRINT_LABELS: Record<number, string> = {
  1: "S1 Urgent",
  2: "S2 Deadlines",
  3: "S3 Admin",
  4: "S4 Deep Work",
};

export const STUDENT_SPRINT_LABELS: Record<number, string> = {
  1: "S1 Urgent",
  2: "S2 Deadlines",
  3: "S3 Quick Tasks",
  4: "S4 Deep Work",
};

/** Sprint 3 reads "Admin" for teachers, "Quick Tasks" for students; S1/S2/S4 are identical in both modes. */
export function getSprintLabels(userMode: UserMode): Record<number, string> {
  return userMode === "STUDENT" ? STUDENT_SPRINT_LABELS : SPRINT_LABELS;
}

const WORK_CATEGORY_LABELS: Record<
  UserMode,
  { standard: string; grading: string; standardShort: string; gradingShort: string }
> = {
  TEACHER: {
    standard: "📅 Prep period",
    grading: "🌙 Work night",
    standardShort: "📅 Prep",
    gradingShort: "🌙 Night",
  },
  STUDENT: {
    standard: "📅 During school",
    grading: "🌙 After school",
    standardShort: "📅 School",
    gradingShort: "🌙 Home",
  },
};

/** workCategory "STANDARD"/"GRADING" as user-facing text. `variant: "short"` for tight table cells. */
export function getWorkCategoryLabel(
  workCategory: string,
  userMode: UserMode,
  variant: "full" | "short" = "full"
): string {
  const labels = WORK_CATEGORY_LABELS[userMode];
  const isGrading = workCategory === "GRADING";
  if (variant === "short") return isGrading ? labels.gradingShort : labels.standardShort;
  return isGrading ? labels.grading : labels.standard;
}

export const SPRINT_CAPACITY = 120; // minutes
```

- [ ] **Step 2: Add the `UserMode` import at the top of the file**

The current top of `lib/utils.ts` is:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInCalendarDays, startOfDay, addDays, format } from "date-fns";
```

Change to:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInCalendarDays, startOfDay, addDays, format } from "date-fns";
import type { UserMode } from "@/components/UserModeProvider";
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors. In particular, confirm `lib/utils.ts` importing from `@/components/UserModeProvider` doesn't create a circular-import error (it won't — `UserModeProvider.tsx` doesn't import from `lib/utils.ts`).

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts
git commit -m "feat: add mode-aware sprint and workCategory label helpers"
```

---

### Task 3: `SprintBadge` becomes mode-aware

**Files:**
- Modify: `components/SprintBadge.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getSprintLabels()` (Task 2).
- No prop/signature change — `<SprintBadge sprint={n} size="sm" />` call sites in `app/tasks/page.tsx`, `app/sprints/page.tsx`, `app/projects/page.tsx`, `app/projects/[id]/page.tsx`, `app/daily/page.tsx`, `app/focus/page.tsx`, `app/time/page.tsx`, `app/review/page.tsx`, and `components/CalendarDayColumn.tsx` need no changes and get the mode-aware label automatically.

- [ ] **Step 1: Rewrite the component**

Full new content of `components/SprintBadge.tsx`:

```tsx
"use client";

import { getSprintLabels } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";

interface SprintBadgeProps {
  sprint: number;
  size?: "sm" | "md";
}

export function SprintBadge({ sprint, size = "md" }: SprintBadgeProps) {
  const { userMode } = useUserMode();
  const label = getSprintLabels(userMode)[sprint] ?? `S${sprint}`;
  const classMap: Record<number, string> = {
    1: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900",
    2: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900",
    3: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900",
    4: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900",
  };
  const cls = classMap[sprint] ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400";
  return (
    <span
      className={`inline-flex items-center rounded font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs"
      } ${cls}`}
    >
      {label}
    </span>
  );
}
```

(The only changes from the current file: added `"use client"`, swapped the static `SPRINT_LABELS` import/lookup for `useUserMode()` + `getSprintLabels()`.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/SprintBadge.tsx
git commit -m "feat: make SprintBadge mode-aware (fixes S3 label across 9 pages)"
```

---

### Task 4: Nav hides Sprints and Templates for students

**Files:**
- Modify: `components/Nav.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1).

- [ ] **Step 1: Type and flag the nav items**

Current:

```tsx
const NAV_ITEMS = [
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/sprints", label: "Sprints", icon: Layers },
  { href: "/focus", label: "Focus", icon: Crosshair },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/review", label: "Review", icon: BarChart2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/lists", label: "Lists", icon: Bookmark },
];
```

Change to:

```tsx
const NAV_ITEMS: { href: string; label: string; icon: typeof CalendarDays; teacherOnly?: boolean }[] = [
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/sprints", label: "Sprints", icon: Layers, teacherOnly: true },
  { href: "/focus", label: "Focus", icon: Crosshair },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/review", label: "Review", icon: BarChart2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate, teacherOnly: true },
  { href: "/lists", label: "Lists", icon: Bookmark },
];
```

- [ ] **Step 2: Import the hook and filter**

Current import block includes:

```tsx
import { useModeContext } from "./ModeProvider";
```

Add directly below it:

```tsx
import { useModeContext } from "./ModeProvider";
import { useUserMode } from "./UserModeProvider";
```

Inside `export function Nav()`, current:

```tsx
  const { mode, setMode } = useModeContext();
```

Change to:

```tsx
  const { mode, setMode } = useModeContext();
  const { userMode } = useUserMode();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.teacherOnly || userMode === "TEACHER");
```

Then in the render, current:

```tsx
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
```

Change to:

```tsx
        {visibleNavItems.map(({ href, label, icon: Icon }) => {
```

- [ ] **Step 3: Verify — type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Verify — manual check in the dev server**

Start the dev server (`npm run dev`), open the app logged in as a user currently in Teacher mode: confirm Sprints and Templates still show in the nav. Go to Settings, switch to Student mode, confirm the switch's inline confirm bar appears and completes. Return to any page: confirm Sprints and Templates have disappeared from the nav (this also exercises Task 6's context-refresh, so if the nav doesn't update without a manual page reload, flag it — Task 6 fixes that). Switch back to Teacher mode and confirm both reappear.

- [ ] **Step 5: Commit**

```bash
git add components/Nav.tsx
git commit -m "feat: hide Sprints and Templates nav links in Student mode"
```

---

### Task 5: `CalendarDayColumn` mode-aware aria-label

**Files:**
- Modify: `components/CalendarDayColumn.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1).

- [ ] **Step 1: Add the hook and swap the aria-label**

Current:

```tsx
export function CalendarDayColumn({
  date,
  dateKey,
  tasks,
  isToday,
  isWeekend,
  isWorkNight,
  isPast,
}: CalendarDayColumnProps) {
  const totalMins = tasks.reduce((s, t) => s + t.estMinutes, 0);
```

Change to:

```tsx
export function CalendarDayColumn({
  date,
  dateKey,
  tasks,
  isToday,
  isWeekend,
  isWorkNight,
  isPast,
}: CalendarDayColumnProps) {
  const { userMode } = useUserMode();
  const totalMins = tasks.reduce((s, t) => s + t.estMinutes, 0);
```

Add the import at the top, alongside the existing imports:

```tsx
import { formatMinutes } from "@/lib/utils";
```
becomes
```tsx
import { formatMinutes } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

And the aria-label itself, current:

```tsx
          {isWorkNight && (
            <Moon className="h-3 w-3 text-indigo-400 shrink-0" aria-label="Work night" />
          )}
```

Change to:

```tsx
          {isWorkNight && (
            <Moon
              className="h-3 w-3 text-indigo-400 shrink-0"
              aria-label={userMode === "STUDENT" ? "After school" : "Work night"}
            />
          )}
```

(This is a direct ternary, not `getWorkCategoryLabel()` — that helper returns emoji-prefixed strings meant for visible UI text, not an `aria-label`.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/CalendarDayColumn.tsx
git commit -m "feat: mode-aware work-night aria-label in calendar view"
```

---

### Task 6: Settings page — short labels + notify Nav on mode switch

**Files:**
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1, for `refresh()` only — this page already tracks its own `userMode` state locally via `loadAll()` and continues to use that local state for rendering), `getWorkCategoryLabel()`, `getSprintLabels()` (Task 2).

- [ ] **Step 1: Import the new helpers and hook**

Current:

```tsx
import { SPRINT_LABELS, formatMinutes } from "@/lib/utils";
```

Change to:

```tsx
import { getSprintLabels, getWorkCategoryLabel, formatMinutes } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

- [ ] **Step 2: Get the shared context's `refresh`, and call it after a successful mode switch**

Current:

```tsx
export default function SettingsPage() {
  const [workNightDays, setWorkNightDays] = useState<number[]>([1]);
```

Change to:

```tsx
export default function SettingsPage() {
  const { refresh: refreshUserMode } = useUserMode();
  const [workNightDays, setWorkNightDays] = useState<number[]>([1]);
```

Current `switchMode`:

```tsx
  async function switchMode(target: "TEACHER" | "STUDENT") {
    setModeSwitching(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMode: target }),
      });
      if (!res.ok) throw new Error("Failed to switch mode");
      setUserMode(target);
      setModeSwitchTarget(null);
      await loadAll();
    } catch {
      alert("Failed to switch mode. Please try again.");
    } finally {
      setModeSwitching(false);
    }
  }
```

Change to:

```tsx
  async function switchMode(target: "TEACHER" | "STUDENT") {
    setModeSwitching(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMode: target }),
      });
      if (!res.ok) throw new Error("Failed to switch mode");
      setUserMode(target);
      setModeSwitchTarget(null);
      await loadAll();
      await refreshUserMode();
    } catch {
      alert("Failed to switch mode. Please try again.");
    } finally {
      setModeSwitching(false);
    }
  }
```

- [ ] **Step 3: Replace the three `SPRINT_LABELS[...]` reads (lines 320, 349, 377 in the pre-change file) with `getSprintLabels(userMode)[...]`**

All three occurrences currently read `SPRINT_LABELS[s]` or `SPRINT_LABELS[p.sprint]`. Replace each with `getSprintLabels(userMode)[s]` / `getSprintLabels(userMode)[p.sprint]` respectively — `userMode` is already in scope as local state on this page (set by `loadAll()`), no new variable needed. There are two `{[1,2,3,4].map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>)}` lines (identical, in the edit-preset row and the add-preset row) and one `{SPRINT_LABELS[p.sprint]}` line (the read-only preset list row).

- [ ] **Step 4: Replace the four hardcoded `"📅 Prep"` / `"🌙 Night"` short labels**

Current (appears twice, identically, in the edit-preset category select and the add-preset category select):

```tsx
                        <SelectItem value="STANDARD" className="text-xs">📅 Prep</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">🌙 Night</SelectItem>
```

Change both occurrences to:

```tsx
                        <SelectItem value="STANDARD" className="text-xs">{getWorkCategoryLabel("STANDARD", userMode, "short")}</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">{getWorkCategoryLabel("GRADING", userMode, "short")}</SelectItem>
```

Current (the read-only preset-list badge):

```tsx
                  <span className={`px-1.5 py-0.5 rounded ${p.workCategory === "GRADING" ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                    {p.workCategory === "GRADING" ? "🌙 Night" : "📅 Prep"}
                  </span>
```

Change to:

```tsx
                  <span className={`px-1.5 py-0.5 rounded ${p.workCategory === "GRADING" ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                    {getWorkCategoryLabel(p.workCategory, userMode, "short")}
                  </span>
```

- [ ] **Step 5: Verify — type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 6: Verify — manual check**

In the dev server, on the Settings page in Student mode: confirm the "My Task Presets" table shows "📅 School" / "🌙 Home" instead of "📅 Prep" / "🌙 Night", and the Sprint column for the "IXL" and "Form / Return" presets reads "S3 Quick Tasks" instead of "S3 Admin". Switch to Teacher mode and confirm the same table reverts to "📅 Prep" / "🌙 Night" / "S3 Admin" exactly as before this change.

- [ ] **Step 7: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: mode-aware preset labels in Settings, refresh nav on mode switch"
```

---

### Task 7: `app/tasks/page.tsx` labels

**Files:**
- Modify: `app/tasks/page.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getWorkCategoryLabel()`, `getSprintLabels()` (Task 2).

- [ ] **Step 1: Swap the import and add the hook**

Current:

```tsx
import { SPRINT_LABELS, SPRINT_COLORS, formatMinutes, formatRelativeDate, urgencySort } from "@/lib/utils";
```

Change to:

```tsx
import { SPRINT_COLORS, formatMinutes, formatRelativeDate, urgencySort, getSprintLabels, getWorkCategoryLabel } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

Find the top of `export default function TasksPage()` (or equivalent component name) and add, alongside the other top-level hooks in that function:

```tsx
  const { userMode } = useUserMode();
```

- [ ] **Step 2: Replace the three `SPRINT_LABELS[s]` reads**

Lines currently reading `{SPRINT_LABELS[s]}` inside `<SelectItem>` (three occurrences — the "add task" sprint select, the "edit task" sprint select, and the "edit recurring task" sprint select): replace each with `{getSprintLabels(userMode)[s]}`.

- [ ] **Step 3: Replace the two `workCategory` `<SelectItem>` pairs**

Current (appears twice, identically — "add task" category select and "edit task" category select):

```tsx
                  <SelectItem value="STANDARD">📅 Prep period</SelectItem>
                  <SelectItem value="GRADING">🌙 Work night</SelectItem>
```

and

```tsx
                        <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
```

Change both to (preserving each occurrence's own `className`, if any):

```tsx
                  <SelectItem value="STANDARD">{getWorkCategoryLabel("STANDARD", userMode)}</SelectItem>
                  <SelectItem value="GRADING">{getWorkCategoryLabel("GRADING", userMode)}</SelectItem>
```

```tsx
                        <SelectItem value="STANDARD" className="text-xs">{getWorkCategoryLabel("STANDARD", userMode)}</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">{getWorkCategoryLabel("GRADING", userMode)}</SelectItem>
```

- [ ] **Step 4: Leave the "☀️ Day" / "🌙 Night" recurring-task toggle button unchanged**

The third `workCategory`-driven UI in this file (`{cat === "STANDARD" ? "☀️ Day" : "🌙 Night"}`, in the recurring-task add form) uses generic, non-teacher-specific wording already. Do not change it — out of scope, and changing it risks inconsistency with nothing to fix.

- [ ] **Step 5: Verify — type-check**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/tasks/page.tsx
git commit -m "feat: mode-aware sprint and workCategory labels on Tasks page"
```

---

### Task 8: `app/projects/page.tsx` labels

**Files:**
- Modify: `app/projects/page.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getWorkCategoryLabel()`, `getSprintLabels()` (Task 2).

- [ ] **Step 1: Swap the import and add the hook**

Current:

```tsx
import { formatMinutes, SPRINT_LABELS, formatRelativeDate } from "@/lib/utils";
```

Change to:

```tsx
import { formatMinutes, formatRelativeDate, getSprintLabels, getWorkCategoryLabel } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

Inside `export default function ProjectsPage()`, current:

```tsx
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
```

Change to:

```tsx
export default function ProjectsPage() {
  const { userMode } = useUserMode();
  const [projects, setProjects] = useState<Project[]>([]);
```

- [ ] **Step 2: Replace the two `SPRINT_LABELS[s]` reads**

Both occurrences of `{SPRINT_LABELS[s]}` inside `<SelectItem>` (the "add task" and "edit task" sprint selects within the project detail expansion) become `{getSprintLabels(userMode)[s]}`.

- [ ] **Step 3: Replace the two `workCategory` `<SelectItem>` pairs**

Current (appears twice, identically):

```tsx
                                <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
```

Change both occurrences to:

```tsx
                                <SelectItem value="STANDARD" className="text-xs">{getWorkCategoryLabel("STANDARD", userMode)}</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">{getWorkCategoryLabel("GRADING", userMode)}</SelectItem>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/projects/page.tsx
git commit -m "feat: mode-aware sprint and workCategory labels on Projects page"
```

---

### Task 9: `app/projects/[id]/page.tsx` labels

**Files:**
- Modify: `app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getWorkCategoryLabel()`, `getSprintLabels()` (Task 2).

- [ ] **Step 1: Swap the import and add the hook**

Current:

```tsx
import { formatMinutes, SPRINT_LABELS, formatRelativeDate } from "@/lib/utils";
```

Change to:

```tsx
import { formatMinutes, formatRelativeDate, getSprintLabels, getWorkCategoryLabel } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

Inside `export default function ProjectDetailPage()`, current:

```tsx
export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
```

Change to:

```tsx
export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { userMode } = useUserMode();

  const [project, setProject] = useState<Project | null>(null);
```

- [ ] **Step 2: Replace the two `SPRINT_LABELS[s]` reads**

Both occurrences of `{SPRINT_LABELS[s]}` inside `<SelectItem>` (the "edit task" and "add task" sprint selects) become `{getSprintLabels(userMode)[s]}`.

- [ ] **Step 3: Replace the two `workCategory` `<SelectItem>` pairs**

Current (appears twice, identically):

```tsx
                                <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
```

Change both occurrences to:

```tsx
                                <SelectItem value="STANDARD" className="text-xs">{getWorkCategoryLabel("STANDARD", userMode)}</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">{getWorkCategoryLabel("GRADING", userMode)}</SelectItem>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "app/projects/[id]/page.tsx"
git commit -m "feat: mode-aware sprint and workCategory labels on Project detail page"
```

---

### Task 10: `components/TemplateManager.tsx` labels

**Files:**
- Modify: `components/TemplateManager.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getWorkCategoryLabel()`, `getSprintLabels()` (Task 2).

- [ ] **Step 1: Swap the import and add the hook**

Current:

```tsx
import { SPRINT_LABELS, formatMinutes } from "@/lib/utils";
```

Change to:

```tsx
import { getSprintLabels, getWorkCategoryLabel, formatMinutes } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

Inside `export function TemplateManager()`, current:

```tsx
export function TemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
```

Change to:

```tsx
export function TemplateManager() {
  const { userMode } = useUserMode();
  const [templates, setTemplates] = useState<Template[]>([]);
```

- [ ] **Step 2: Replace the one `SPRINT_LABELS[s]` read**

`{SPRINT_LABELS[s]}` inside the task-row sprint `<SelectItem>` becomes `{getSprintLabels(userMode)[s]}`.

- [ ] **Step 3: Replace the one `workCategory` `<SelectItem>` pair**

Current:

```tsx
                                <SelectItem value="STANDARD" className="text-xs">📅 Prep</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">🌙 Night</SelectItem>
```

Change to:

```tsx
                                <SelectItem value="STANDARD" className="text-xs">{getWorkCategoryLabel("STANDARD", userMode, "short")}</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">{getWorkCategoryLabel("GRADING", userMode, "short")}</SelectItem>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/TemplateManager.tsx
git commit -m "feat: mode-aware sprint and workCategory labels in TemplateManager"
```

---

### Task 11: `app/daily/page.tsx` sprint labels

**Files:**
- Modify: `app/daily/page.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getSprintLabels()` (Task 2). No `workCategory` literal strings exist in this file (confirmed by the earlier audit) — this task only touches sprint labels.

- [ ] **Step 1: Swap the import and add the hook**

Current:

```tsx
import {
  formatMinutes,
  formatRelativeDate,
  SPRINT_LABELS,
  SPRINT_COLORS,
} from "@/lib/utils";
```

Change to:

```tsx
import {
  formatMinutes,
  formatRelativeDate,
  getSprintLabels,
  SPRINT_COLORS,
} from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

Find the top of `export default function DailyPage()` (or equivalent) and add, alongside the other top-level hooks:

```tsx
  const { userMode } = useUserMode();
```

- [ ] **Step 2: Replace the three `SPRINT_LABELS` reads**

Two occurrences inside `<SelectItem>` (`{SPRINT_LABELS[s]}`, in the "edit urgent task" sprint select and the forage task sprint select) become `{getSprintLabels(userMode)[s]}`. One read-only occurrence (`<span className="text-xs font-medium">{SPRINT_LABELS[sprint]}</span>`, in the "Today's Work" sprint-group header) becomes `<span className="text-xs font-medium">{getSprintLabels(userMode)[sprint]}</span>`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: mode-aware sprint labels on Daily page"
```

---

### Task 12: `app/review/page.tsx` chart label

**Files:**
- Modify: `app/review/page.tsx`

**Interfaces:**
- Consumes: `useUserMode()` (Task 1), `getSprintLabels()` (Task 2).

- [ ] **Step 1: Swap the import and add the hook**

Current:

```tsx
import { SPRINT_COLORS, SPRINT_LABELS, formatMinutes } from "@/lib/utils";
```

Change to:

```tsx
import { SPRINT_COLORS, getSprintLabels, formatMinutes } from "@/lib/utils";
import { useUserMode } from "@/components/UserModeProvider";
```

Inside `export default function ReviewPage()`, current:

```tsx
export default function ReviewPage() {
  const { mode } = useModeContext();
```

Change to:

```tsx
export default function ReviewPage() {
  const { mode } = useModeContext();
  const { userMode } = useUserMode();
```

- [ ] **Step 2: Replace the chart-data label**

Current:

```tsx
  const chartData = data.sprintBreakdown.map((s) => ({
    name: `S${s.sprint}`,
    label: SPRINT_LABELS[s.sprint],
    actual: s.actual,
    est: s.est,
  }));
```

Change to:

```tsx
  const chartData = data.sprintBreakdown.map((s) => ({
    name: `S${s.sprint}`,
    label: getSprintLabels(userMode)[s.sprint],
    actual: s.actual,
    est: s.est,
  }));
```

Note: this is placed after the early-return `if (!data) { ... }` block, so `data` is guaranteed non-null here — no change needed to that guard.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/review/page.tsx
git commit -m "feat: mode-aware sprint label in Review chart"
```

---

## Final check (after all 12 tasks)

- [ ] Run `npx tsc --noEmit -p .` once more across the whole repo — zero errors attributable to any file this plan touched.
- [ ] Run `npm run build` (matches this repo's CI/production build path: `prisma generate && next build`) to catch anything `tsc --noEmit` alone wouldn't (e.g. `"use client"` boundary issues from Task 3's `SprintBadge` change).
- [ ] Manual pass in the dev server, Student mode: Daily, Tasks, Projects, Project detail, Settings, Review, Focus, Time all show student wording; Sprints and Templates are gone from nav.
- [ ] Manual pass in the dev server, Teacher mode: every one of the same pages is pixel-identical to before this plan — same emoji, same words, same nav items.
- [ ] Stop here — do not push to `main`. This branch (`student-mode-ux-cleanup`) is for review before merge, per this session's agreed workflow.
