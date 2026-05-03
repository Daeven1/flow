# Design: Daily / Projects / Time Log Improvements

**Date:** 2026-05-03

## Overview

Three targeted improvements:
1. Due Very Soon box on Daily page gains drag-to-reorder and inline edit.
2. Project detail page task list gains drag-to-reorder (persisted) and a per-task "show in all views" flag.
3. Time Log page filters to completed tasks only.

---

## 1. Data Layer

### Migration

Add two fields to the `Task` model:

```prisma
showInRegular  Boolean  @default(false)
sortOrder      Int      @default(0)
```

Both default to safe values — existing tasks are unaffected.

### API changes

**`GET /api/tasks`** — change `where` from:
```ts
{ userId, projectId: null }
```
to:
```ts
{ userId, OR: [{ projectId: null }, { showInRegular: true }] }
```
This is the only change needed to make flagged project tasks visible in Daily, Focus, Sprints, and all other non-project views.

**`PATCH /api/tasks/[id]`** — add handling for two new body fields:
```ts
if ("showInRegular" in body) data.showInRegular = Boolean(body.showInRegular);
if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder);
```

**`GET /api/projects/[id]`** — order tasks by `sortOrder ASC, deadline ASC` (replaces deadline-only ordering).

---

## 2. Due Very Soon Box (Daily Page)

### Drag-to-reorder

- `urgentNow` array moves from a derived constant into a `useState<Task[]>` that is initialised from the filtered+sorted data and updated on drag end.
- Wrap the list with `DragDropContext + Droppable + Draggable` from `@hello-pangea/dnd` (already installed).
- Add a `GripVertical` handle as the leftmost element of each row.
- Order is **client-side only** — intentionally resets each day. This is the right model since Due Very Soon is a daily prioritisation view, not a persistent list.

### Inline edit

- Add a `Pencil` icon that appears on row hover (same pattern as project task rows).
- Clicking it opens an inline edit form replacing the row: fields for name, sprint, deadline, estMinutes, with Save and Cancel buttons.
- Save fires `PATCH /api/tasks/${id}` then calls `loadData()` to refresh.
- No new endpoint needed.

---

## 3. Project Task List (Project Detail Page)

### Drag-to-reorder (persisted)

- Wrap the task list with `DragDropContext + Droppable + Draggable`.
- Add a `GripVertical` handle as the leftmost element of each task row.
- On drag end: optimistically reorder local state, then fire `PATCH /api/tasks/${id}` for each task in the new order with its updated `sortOrder` index (0-based position). Project lists are small so N individual requests is acceptable.
- Tasks are loaded and displayed ordered by `sortOrder ASC, deadline ASC` from the API.

### "Show in all views" flag

- Add a small icon button (e.g. `Globe` or `Layers` from lucide-react) on each task row, always visible (not hidden on hover) since it's a meaningful persistent state.
- When `showInRegular` is `true`, the icon is highlighted blue; when `false`, it is muted grey.
- Clicking toggles `showInRegular` via `PATCH /api/tasks/${id}` and updates local state.
- Tooltip text: "Show in all views".
- The existing pencil-icon inline edit form is unchanged.

---

## 4. Time Log Page

Two filter changes, no backend work required.

**Task picker (log time form):**
Change filter from `!t.done` to `t.done`. Workflow becomes: complete a task, then log actual time against it.

**Estimated vs Actual table:**
Change filter from `t.actualMinutes != null` to `t.done && t.actualMinutes != null`. Only completed tasks with logged time are shown.

**Sprint accuracy bars:**
Unchanged — they aggregate over all tasks with actual data and benefit from the full dataset regardless of done status.

---

## Implementation Order

1. Prisma migration (add `showInRegular`, `sortOrder` to Task)
2. API updates (`GET /api/tasks`, `PATCH /api/tasks/[id]`, `GET /api/projects/[id]`)
3. Time Log filter changes (smallest, isolated)
4. Due Very Soon drag + edit (Daily page)
5. Project task drag + showInRegular flag (Project detail page)
