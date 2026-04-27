# Focus Queue Drag-to-Order Design

**Date:** 2026-04-27
**Status:** Approved

## Overview

Add drag-to-reorder to the "Your pile" queue panel in Focus Mode, so users can set the exact order sticky notes will appear before starting a session.

No schema changes. No API changes. Purely a UI state change in `app/focus/page.tsx`.

---

## Current State

- Selected tasks are stored as `Set<string>` (unordered).
- The "Your pile" panel on the right shows a decorative sticky-note stack preview and a count.
- "Start Focus Session →" button sits in the task list panel (left).
- `startSession()` filters `tasks` by the Set, producing an array in the original fetch order.

---

## Changes

### State: `Set<string>` → `string[]`

Replace:
```typescript
const [selected, setSelected] = useState<Set<string>>(new Set());
```
With:
```typescript
const [queue, setQueue] = useState<string[]>([]);
```

`queue` is an ordered array of task IDs. Position 0 = first sticky note on top.

All references to `selected` update accordingly:
- `toggle(id)` → append id to end if not present; filter it out if present
- `selected.has(id)` → `queue.includes(id)`
- `selected.size` → `queue.length`
- `startSession()` → `const pile = queue.map(id => tasks.find(t => t.id === id)!)`

### "Your pile" panel: draggable list

Replace the decorative sticky preview with a `@hello-pangea/dnd` drag list showing all queued tasks in order. Each row:
- `GripVertical` drag handle icon (left, from lucide-react)
- Task name (flex-1)
- Sprint badge + est minutes (right)
- Clicking a row removes it from the queue (returns it to the available list)

The list has a position number badge (1, 2, 3…) on each row so the order is visually explicit.

When the queue is empty, keep the existing decorative placeholder sticky note with "Check tasks to add them here".

### "Start Focus Session →" button

Move from the task list panel to the bottom of the "Your pile" panel. Disabled when `queue.length === 0`.

This cleans up the task list panel — it becomes a pure selection list with no action button.

### Drag behaviour

Use `DragDropContext` + `Droppable` + `Draggable` from `@hello-pangea/dnd` (already installed). `onDragEnd` reorders the `queue` array in place. No API call needed — order is local state only.

---

## Layout Summary

```
┌─────────────────────────────┐  ┌────────────────────────┐
│ Build your pile             │  │ Your pile (N tasks)    │
│ ─────────────────────────── │  │ ──────────────────────  │
│ ☐ Task A   Sprint 1  30m   │  │ ⠿ 1. Task C  S2  20m  │
│ ☑ Task B   Sprint 2  20m   │  │ ⠿ 2. Task B  S2  45m  │
│ ☑ Task C   Sprint 2  20m   │  │                         │
│ ☐ Task D   Sprint 3  45m   │  │                         │
│                             │  │                         │
│                             │  │ [Start Focus Session →] │
└─────────────────────────────┘  └────────────────────────┘
```

On mobile (< lg breakpoint): stacks vertically, task list on top, queue below.

---

## Files Changed

| File | Change |
|---|---|
| `app/focus/page.tsx` | Replace `selected` Set with `queue` array; rewrite "Your pile" panel with drag list; move Start button |

`components/StickyPile.tsx` — no changes needed. It already accepts `tasks: Task[]` in order.

`@hello-pangea/dnd` — already installed (used by projects list). No new dependencies.
