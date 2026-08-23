# Tasks Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fortnight calendar view to `/tasks` where open tasks can be placed on days by dragging, with an Unscheduled tray.

**Architecture:** A `List / Calendar` toggle on `/tasks` swaps the existing list for `TasksCalendar` — a single `DragDropContext` containing an Unscheduled tray and 14 day columns, each a `Droppable`. Dropping a task PATCHes `scheduledDate` and sets a new `schedulePinned` flag, which stops the server recomputing that date when the deadline later changes.

**Tech Stack:** Next.js 16 App Router, React client components, `@hello-pangea/dnd` (already a dependency), Prisma, Tailwind v3, date-fns v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-23-tasks-calendar-view-design.md`

## Global Constraints

- **No new dependencies.** Drag and drop uses `@hello-pangea/dnd`, already used by `/daily` and `/projects/[id]`.
- **Schema changes use `npx prisma db push`**, never `prisma migrate dev` (shadow-DB issues on Supabase).
- **Every API route keeps `export const runtime = 'nodejs'`** at the top — Prisma requires the Node.js runtime on Vercel.
- **All task views filter by the active Personal/Professional mode.** `/tasks` already does this via `fetch('/api/tasks?context=' + mode)`.
- **There is no test runner in this project.** Every task is gated by `npx tsc --noEmit` and `npm run build`, both of which must pass with no errors. Behavioural checks are listed in Task 5 and require a signed-in browser, which automation cannot reach.
- **Optimistic UI with rollback** is the established pattern for mutations (see `app/projects/[id]/page.tsx:255`). Follow it.
- **No manual reordering within a day.** `Task.sortOrder` is the per-project index and must not be written by calendar code. Columns sort by sprint, then deadline soonest-first.
- **Commit after every task.** Do not push or deploy; that happens in Task 5.

---

### Task 1: `schedulePinned` field and PATCH guard

Adds the flag and makes the server respect it. Without this, editing a task's deadline silently moves the day you placed it on.

**Files:**
- Modify: `prisma/schema.prisma` (the `Task` model, after the `pinned` field)
- Modify: `app/api/tasks/[id]/route.ts:39-56` (the `deadline` branch of PATCH)

**Interfaces:**
- Consumes: nothing.
- Produces: `Task.schedulePinned: boolean`, returned by `GET /api/tasks` and accepted by `PATCH /api/tasks/[id]` as `schedulePinned?: boolean`.

- [ ] **Step 1: Add the field to the Task model**

In `prisma/schema.prisma`, in `model Task`, directly after the line `pinned        Boolean   @default(false)`:

```prisma
  schedulePinned Boolean  @default(false)
```

- [ ] **Step 2: Push the schema to the database**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema", followed by the Prisma Client regenerating. Existing rows default to `false`.

- [ ] **Step 3: Accept the flag in PATCH**

In `app/api/tasks/[id]/route.ts`, directly after the line `if ("pinned" in body) data.pinned = Boolean(body.pinned);`:

```ts
  if ("schedulePinned" in body) data.schedulePinned = Boolean(body.schedulePinned);
```

- [ ] **Step 4: Guard the recompute branch**

Replace the whole `if ("deadline" in body) { ... }` block with:

```ts
  if ("deadline" in body) {
    data.deadline = body.deadline ? new Date(body.deadline) : null;

    const existing = await prisma.task.findUnique({ where: { id, userId } });
    // A day chosen by hand on the calendar outranks the derived schedule
    const pinned =
      "schedulePinned" in body
        ? Boolean(body.schedulePinned)
        : Boolean(existing?.schedulePinned);

    if (!pinned && !("scheduledDate" in body)) {
      if (body.deadline) {
        const workNightDays = await getWorkNightDays(userId);
        data.scheduledDate = computeScheduledDate(
          new Date(body.deadline),
          (body.workCategory ?? existing?.workCategory ?? "STANDARD") as string,
          Number(body.estMinutes ?? existing?.estMinutes ?? 30),
          workNightDays
        );
      } else {
        data.scheduledDate = null;
      }
    }
  }
```

Note the behaviour change this encodes: for a pinned task, clearing the deadline no longer clears `scheduledDate`. That is deliberate — "I'll do this Thursday" should survive deleting a due date. Unpinned tasks behave exactly as before.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run build`
Expected: "✓ Compiled successfully", no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma "app/api/tasks/[id]/route.ts"
git commit -m "feat: add schedulePinned so hand-placed dates survive deadline edits"
```

---

### Task 2: `CalendarDayColumn` component

One day column: header, minute total, and a droppable list of task cards. Presentational — it holds no state and issues no requests.

**Files:**
- Create: `components/CalendarDayColumn.tsx`

**Interfaces:**
- Consumes: `Task.schedulePinned` from Task 1 (only via the shared task shape; the column does not read it).
- Produces:
  - `export interface CalendarTask { id: string; name: string; sprint: number; estMinutes: number; deadline: string | null; scheduledDate: string | null; workCategory: string; project: { id: string; name: string } | null }`
  - `export function CalendarDayColumn(props: { date: Date; dateKey: string; tasks: CalendarTask[]; isToday: boolean; isWeekend: boolean; isWorkNight: boolean; isPast: boolean }): JSX.Element`
  - The column renders a `Droppable` whose `droppableId` is `` `day:${dateKey}` `` where `dateKey` is `yyyy-MM-dd`. Task 3 depends on that exact prefix.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { Droppable, Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { Moon } from "lucide-react";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { formatMinutes } from "@/lib/utils";

export interface CalendarTask {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  project: { id: string; name: string } | null;
}

interface CalendarDayColumnProps {
  date: Date;
  dateKey: string;
  tasks: CalendarTask[];
  isToday: boolean;
  isWeekend: boolean;
  isWorkNight: boolean;
  isPast: boolean;
}

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

  return (
    <div
      className={[
        "flex flex-col shrink-0 rounded-lg border",
        isWeekend
          ? "w-32 bg-slate-50/60 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800"
          : "w-48 bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800",
        isToday ? "ring-2 ring-purple-400" : "",
        isPast ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="px-2.5 py-2 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-xs font-medium ${
              isToday
                ? "text-purple-600 dark:text-purple-400"
                : isWeekend
                ? "text-slate-400 dark:text-zinc-500"
                : "text-slate-700 dark:text-zinc-200"
            }`}
          >
            {format(date, "EEE")}
          </span>
          <span
            className={`text-sm tabular-nums ${
              isToday
                ? "font-bold text-purple-600 dark:text-purple-400"
                : "text-slate-500 dark:text-zinc-400"
            }`}
          >
            {format(date, "d")}
          </span>
          {isWorkNight && (
            <Moon className="h-3 w-3 text-indigo-400 shrink-0" aria-label="Work night" />
          )}
          {totalMins > 0 && (
            <span className="ml-auto text-[10px] tabular-nums text-slate-400 dark:text-zinc-500">
              {formatMinutes(totalMins)}
            </span>
          )}
        </div>
      </div>

      <Droppable droppableId={`day:${dateKey}`}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[7rem] p-1.5 space-y-1.5 rounded-b-lg transition-colors ${
              snapshot.isDraggingOver ? "bg-purple-50 dark:bg-purple-950/40" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={`rounded-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 space-y-1 ${
                      dragSnapshot.isDragging ? "shadow-lg" : ""
                    }`}
                  >
                    <p className="text-xs leading-snug text-slate-700 dark:text-zinc-200">
                      {task.name}
                    </p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <SprintBadge sprint={task.sprint} size="sm" />
                      {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the badge prop names match the existing components**

Run: `grep -n "interface\|props" components/SprintBadge.tsx components/UrgencyBadge.tsx`
Expected: `SprintBadge` takes `sprint` and an optional `size`; `UrgencyBadge` takes `dueDate`. If either differs, adjust the calls above to match the real signature rather than changing the badge components.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output. (The component is unused so far — that is fine.)

- [ ] **Step 4: Commit**

```bash
git add components/CalendarDayColumn.tsx
git commit -m "feat: add CalendarDayColumn for the tasks calendar"
```

---

### Task 3: `TasksCalendar` component

The fortnight strip: window navigation, the Unscheduled tray, 14 columns, and the drag handling that persists a drop.

**Files:**
- Create: `components/TasksCalendar.tsx`

**Interfaces:**
- Consumes: `CalendarDayColumn` and `CalendarTask` from Task 2; the `schedulePinned` PATCH field from Task 1.
- Produces: `export function TasksCalendar(props: { tasks: CalendarTask[]; workNightDays: number[]; onReload: () => void }): JSX.Element`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { CalendarDayColumn, type CalendarTask } from "@/components/CalendarDayColumn";

const WINDOW_DAYS = 14;

interface TasksCalendarProps {
  tasks: CalendarTask[];
  workNightDays: number[];
  onReload: () => void;
}

function sortForColumn(list: CalendarTask[]) {
  return [...list].sort((a, b) => {
    if (a.sprint !== b.sprint) return a.sprint - b.sprint;
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
  });
}

export function TasksCalendar({ tasks, workNightDays, onReload }: TasksCalendarProps) {
  const [local, setLocal] = useState<CalendarTask[]>(tasks);
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()));

  // Keep the optimistic copy in step with fresh server data
  useEffect(() => {
    setLocal(tasks);
  }, [tasks]);

  const today = startOfDay(new Date());
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i));
  const unscheduled = sortForColumn(local.filter((t) => !t.scheduledDate));

  function tasksForDay(dateKey: string) {
    return sortForColumn(
      local.filter(
        (t) => t.scheduledDate && format(parseISO(t.scheduledDate), "yyyy-MM-dd") === dateKey
      )
    );
  }

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const toTray = destination.droppableId === "tray";
    const nextDate = toTray ? null : destination.droppableId.slice("day:".length);

    const snapshot = local;
    setLocal((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, scheduledDate: nextDate } : t))
    );

    const res = await fetch(`/api/tasks/${draggableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate: nextDate, schedulePinned: !toTray }),
    });

    if (!res.ok) {
      setLocal(snapshot);
      return;
    }
    onReload();
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWindowStart((d) => addDays(d, -WINDOW_DAYS))}
            className="rounded-md border border-slate-200 dark:border-zinc-800 p-1 hover:bg-slate-50 dark:hover:bg-zinc-800"
            aria-label="Previous fortnight"
          >
            <ChevronLeft className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
          </button>
          <button
            type="button"
            onClick={() => setWindowStart(startOfDay(new Date()))}
            className="rounded-md border border-slate-200 dark:border-zinc-800 px-2 py-1 text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWindowStart((d) => addDays(d, WINDOW_DAYS))}
            className="rounded-md border border-slate-200 dark:border-zinc-800 p-1 hover:bg-slate-50 dark:hover:bg-zinc-800"
            aria-label="Next fortnight"
          >
            <ChevronRight className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
          </button>
          <span className="text-xs text-slate-500 dark:text-zinc-400 ml-1">
            {format(days[0], "d MMM")} — {format(days[days.length - 1], "d MMM yyyy")}
          </span>
        </div>

        <div className="flex gap-3 items-start">
          {/* Unscheduled tray */}
          <div className="shrink-0 w-52 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <div className="px-2.5 py-2 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-200">
                Unscheduled
              </span>
              <span className="ml-1.5 text-[10px] tabular-nums text-slate-400 dark:text-zinc-500">
                {unscheduled.length}
              </span>
            </div>
            <Droppable droppableId="tray">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`p-1.5 space-y-1.5 min-h-[10rem] max-h-[32rem] overflow-y-auto rounded-b-lg transition-colors ${
                    snapshot.isDraggingOver ? "bg-purple-50 dark:bg-purple-950/40" : ""
                  }`}
                >
                  {unscheduled.length === 0 && !snapshot.isDraggingOver && (
                    <p className="px-1 py-2 text-xs italic text-slate-400 dark:text-zinc-500">
                      Everything has a day. Drag a task here to unschedule it.
                    </p>
                  )}
                  {unscheduled.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={`rounded-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 space-y-1 ${
                            dragSnapshot.isDragging ? "shadow-lg" : ""
                          }`}
                        >
                          <p className="text-xs leading-snug text-slate-700 dark:text-zinc-200">
                            {task.name}
                          </p>
                          <div className="flex items-center gap-1 flex-wrap">
                            <SprintBadge sprint={task.sprint} size="sm" />
                            {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Day columns */}
          <div className="flex-1 overflow-x-auto pb-2">
            <div className="flex gap-2">
              {days.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const weekday = day.getDay();
                return (
                  <CalendarDayColumn
                    key={dateKey}
                    date={day}
                    dateKey={dateKey}
                    tasks={tasksForDay(dateKey)}
                    isToday={dateKey === format(today, "yyyy-MM-dd")}
                    isWeekend={weekday === 0 || weekday === 6}
                    isWorkNight={workNightDays.includes(weekday)}
                    isPast={day < today}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run build`
Expected: "✓ Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add components/TasksCalendar.tsx
git commit -m "feat: add TasksCalendar fortnight strip with drag-to-schedule"
```

---

### Task 4: Wire the view toggle into `/tasks`

Adds the `List / Calendar` switch, remembers the choice, and supplies the calendar with work-night data.

**Files:**
- Modify: `app/tasks/page.tsx` — imports (line ~17), state (near line 70), `load` (line 108), header JSX (line 305), and the list body (lines 380 to the end of the return)

**Interfaces:**
- Consumes: `TasksCalendar` from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports**

Add to the lucide-react import list on line 17: `List`, `CalendarDays`.
Add below the existing imports:

```tsx
import { TasksCalendar } from "@/components/TasksCalendar";
```

- [ ] **Step 2: Add state**

Next to `const [filter, setFilter] = useState<FilterMode>("all");`:

```tsx
  const [view, setView] = useState<"list" | "calendar">("list");
  const [workNightDays, setWorkNightDays] = useState<number[]>([1]);
```

The default is `"list"`, so the page behaves exactly as it does today until the user switches.

- [ ] **Step 3: Restore the saved view after mount**

Reading `localStorage` during render breaks server rendering, so do it in an effect. Add directly after the existing `useEffect(() => { load(); }, [load]);`:

```tsx
  useEffect(() => {
    const saved = localStorage.getItem("grove-tasks-view");
    if (saved === "calendar" || saved === "list") setView(saved);
  }, []);
```

- [ ] **Step 4: Fetch work-night days in `load`**

`GET /api/settings` returns `{ workNightDays: number[], userMode: string }`. Extend the existing `Promise.all` in `load` (line 110) to include it, and set the state:

```tsx
  const load = useCallback(async () => {
    await fetch("/api/recurring/spawn", { method: "POST" });
    const [tasksRes, presetsRes, recurringRes, settingsRes] = await Promise.all([
      fetch(`/api/tasks?context=${mode}`),
      fetch("/api/presets"),
      fetch("/api/recurring"),
      fetch("/api/settings"),
    ]);
    setTasks(await tasksRes.json());
    setPresets(await presetsRes.json());
    setRecurringTasks(await recurringRes.json());
    const settings = await settingsRes.json();
    if (Array.isArray(settings?.workNightDays)) setWorkNightDays(settings.workNightDays);
  }, [mode]);
```

- [ ] **Step 5: Add the toggle to the page header**

In the header block starting at line 305, replace the `<Button size="sm" onClick={() => setShowForm(!showForm)}>…</Button>` with that button preceded by the toggle, both inside a flex row:

```tsx
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-200 dark:border-zinc-800 overflow-hidden">
            {([
              { value: "list" as const, label: "List", Icon: List },
              { value: "calendar" as const, label: "Calendar", Icon: CalendarDays },
            ]).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setView(value);
                  localStorage.setItem("grove-tasks-view", value);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                  view === value
                    ? "bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white font-medium"
                    : "text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add task
          </Button>
        </div>
```

- [ ] **Step 6: Swap the body on the toggle**

The list body runs from the `{/* Filter chips */}` comment (line ~380) to just before the final two closing `</div>`s of the returned JSX. Wrap exactly that range so the calendar replaces it:

```tsx
      {view === "calendar" ? (
        <TasksCalendar
          tasks={tasks.filter((t) => !t.done)}
          workNightDays={workNightDays}
          onReload={load}
        />
      ) : (
        <>
          {/* …the existing filter chips, task list, and recurring section, unchanged… */}
        </>
      )}
```

The Add-task form above stays outside the conditional so it works in both views. Do not move or edit the list markup — only wrap it.

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output. A common failure here is an unbalanced JSX fragment from Step 6 — if `tsc` reports an unexpected token near the end of the file, the wrap is misplaced.

Run: `npm run build`
Expected: "✓ Compiled successfully".

- [ ] **Step 8: Commit**

```bash
git add app/tasks/page.tsx
git commit -m "feat: add List/Calendar toggle to the tasks page"
```

---

### Task 5: Verify, deploy, and hand over the manual checks

**Files:** none modified.

**Interfaces:** none.

- [ ] **Step 1: Full build from clean**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Deploy**

Vercel does not auto-deploy this project. Run: `vercel --prod --yes`
Expected: output ends with `Aliased  https://growinthegrove.vercel.app` and `"readyState": "READY"`. If the CLI times out while polling, confirm with `vercel ls --prod` and by fetching a built chunk from the alias.

- [ ] **Step 4: Report the manual checklist to the user**

`/tasks` sits behind Supabase auth, so automation cannot exercise the drag behaviour. Report these checks verbatim for the user to run:

1. The `List / Calendar` toggle switches views, and the choice survives a page reload.
2. Dragging a task from the Unscheduled tray onto a day puts it in that column, and it is still there after a reload.
3. Dragging a task from one day to another moves it; dragging it back to the tray clears its date.
4. Edit the deadline of a task that was dragged onto a day — its calendar day must not move.
5. Edit the deadline of a task that has never been dragged — its day should still recompute as before.
6. Weekends read as narrower and muted; work nights show a moon; today is ringed. Check in both light and dark mode.
7. Switching Personal/Professional mode changes which tasks appear.

---

## Self-Review Notes

Checked against the spec:

- §3 data model → Task 1. §4 API → Task 1. §5.1 toggle → Task 4. §5.2 `TasksCalendar` → Task 3. §5.3 `CalendarDayColumn` → Task 2. §6 interaction and rollback → Task 3 Step 1. §7 filtering → Task 4 Step 6 (`!t.done`) plus the existing `?context=` query. §8 verification → Task 5.
- Names are consistent across tasks: `CalendarTask`, `CalendarDayColumn`, `TasksCalendar`, `schedulePinned`, droppable ids `tray` and `day:<yyyy-MM-dd>`.
- One spec detail deliberately extended in Task 1 Step 4: clearing a deadline no longer nulls `scheduledDate` for pinned tasks. The spec did not cover this case; the choice is recorded in the task text.
