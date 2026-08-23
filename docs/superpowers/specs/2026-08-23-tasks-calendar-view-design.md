# Grove — Tasks Calendar View Design

**Date:** 2026-08-23
**Status:** Awaiting review

---

## 1. Problem

After several months of daily use, `/tasks` is only visited to answer one question:
*"what's coming up later?"* Everything happening now lives on `/daily`. A flat,
sprint-filtered list answers that question poorly — it shows what exists, not
when it lands.

This design adds a fortnight calendar view to `/tasks` where tasks can be placed
on days by dragging, turning the page from a list of later work into a planning
surface.

Related but explicitly **out of scope** (tracked separately): Today's Forage is
being reframed from "urgent" to "meant to be done today or tomorrow". That is a
change to the `/daily` filter and its copy, not to this feature.

---

## 2. Core decision: what a drop means

`scheduledDate` is currently **derived**, never chosen. `lib/utils.ts:computeScheduledDate`
computes it from `deadline` + `workCategory` + `estMinutes`:

- `GRADING` → walk back from the deadline to the most recent work-night
- `STANDARD` → deadline minus a buffer (1d ≤30m, 2d ≤90m, 3d >90m), skipping weekends
- Never earlier than today

Dropping a task on a calendar day **pins the work day**: it sets `scheduledDate`
directly and leaves `deadline` untouched. This lets a task due next Friday sit on
Thursday of this week because that is when you intend to do it.

Rejected alternatives:

| Alternative | Why not |
|---|---|
| Drop moves the `deadline` | Cannot express "do this Thursday, due next Friday" — the exact case that motivates the feature |
| Two calendars (due dates / work days) with a toggle | Most expressive, but doubles the surface and needs explaining; not worth it before the simple version has been used |

### 2.1 Why a new field is needed

`PATCH /api/tasks/[id]` already honours an explicit `scheduledDate` and only
recomputes when `deadline` changes *and* no `scheduledDate` was supplied
(`app/api/tasks/[id]/route.ts:42`). So a manual date already survives — until the
deadline is edited, at which point it is silently overwritten.

`schedulePinned` exists solely to prevent that overwrite.

---

## 3. Data model

One field added to `Task`:

```prisma
schedulePinned Boolean @default(false)
```

Applied with `prisma db push` (per project convention — not `migrate dev`).

No other model changes. Existing tasks default to `false` and keep today's
auto-computed behaviour.

---

## 4. API changes

No new routes.

### 4.1 `PATCH /api/tasks/[id]`

- Accept `schedulePinned` in the body and persist it.
- Guard the recompute branch: when the stored task has `schedulePinned === true`
  and the request does not explicitly set `schedulePinned: false`, a `deadline`
  change updates the deadline only and leaves `scheduledDate` alone.

### 4.2 Requests the calendar issues

| Action | Body |
|---|---|
| Drop on a day | `{ scheduledDate: "<yyyy-MM-dd>", schedulePinned: true }` |
| Drop on the Unscheduled tray | `{ scheduledDate: null, schedulePinned: false }` |
| Reorder within a day | `{ sortOrder: <n> }` per affected task |

`GET /api/tasks` needs no change — it already returns `scheduledDate` and will
include the new field automatically.

---

## 5. Components

### 5.1 `app/tasks/page.tsx`

Gains a `List / Calendar` segmented toggle in the page header. The choice
persists in `localStorage` under key `grove-tasks-view` (same pattern as
`grove-theme`), defaulting to `list` so existing behaviour is unchanged on first
load. Recurring-task management stays under the list view only.

### 5.2 `components/TasksCalendar.tsx`

The fortnight strip.

- A single `DragDropContext`.
- A sticky **Unscheduled tray** on the left: one `Droppable` holding every open,
  in-mode task with `scheduledDate === null`.
- 14 day columns in a horizontally scrolling row, one `Droppable` each,
  `droppableId` = the ISO date string.
- Header controls: `←` / `→` shift the window by 14 days, `Today` returns to the
  window containing today.
- The visible window is component state only. It is not persisted; every visit
  starts at today.

### 5.3 `components/CalendarDayColumn.tsx`

One day column:

- Date header — weekday short name and day number; today is highlighted.
- Summed `estMinutes` of the column's tasks, rendered with `formatMinutes`.
- Task cards showing name, `SprintBadge`, and `UrgencyBadge` when a deadline
  exists.
- Weekends render at reduced width with muted styling but remain valid drop
  targets (Personal mode work and catch-up marking both land there).
- Days matching `workNightDays` show a small moon marker, since `GRADING` work
  belongs on those nights.

---

## 6. Interaction and data flow

1. User drags a card from the tray or another column.
2. `onDragEnd` computes the target date from `destination.droppableId`.
3. Local state updates immediately (optimistic).
4. `PATCH` fires with the bodies in §4.2.
5. On a non-OK response, local state rolls back to the pre-drag snapshot and the
   error surfaces — the same pattern already used for Forage drag ordering and
   the `showInRegular` toggle.

Reordering within a column writes `sortOrder` for that column's tasks, matching
project-detail reordering.

---

## 7. Filtering rules

- Open tasks only (`done === false`).
- Scoped to the active Personal/Professional mode, like every other task view.
- Day columns for past dates still render their tasks, with the existing overdue
  urgency treatment. Overdue work is not hidden.
- The Unscheduled tray shows in-mode open tasks with no `scheduledDate`,
  regardless of whether they have a deadline.

---

## 8. Verification

No test runner exists in this project, so verification is:

- `npx tsc --noEmit` and `npm run build` must pass at every step.
- `/tasks` is behind Supabase auth and cannot be reached by an automated browser
  session, so drag behaviour must be confirmed by the user on a deploy. The
  checks to run:
  1. Toggle switches views and the choice survives a reload.
  2. Drag tray → day sets the date; the card appears in that column after reload.
  3. Drag day → day moves it; drag day → tray clears the date.
  4. Edit the deadline of a pinned task; its calendar day does not move.
  5. Edit the deadline of a never-dragged task; its day still recomputes as before.
  6. Weekend and work-night styling render correctly in light and dark mode.

---

## 9. Out of scope

- Times of day; tasks stay day-granular.
- Multi-day spans.
- Scheduling at the project level.
- Month or agenda layouts.
- Any change to Today's Forage semantics or copy.
