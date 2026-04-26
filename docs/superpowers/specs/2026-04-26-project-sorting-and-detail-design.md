# Project Sorting + Project Detail Page

**Date:** 2026-04-26  
**Status:** Approved

## Overview

Two features:
1. Projects can be reordered by dragging — order persists to the database.
2. Each project opens as a full-page view at `/projects/[id]` with its task list and a free-form notes scratchpad.

---

## Schema Changes

Add two fields to the `Project` model:

```prisma
model Project {
  // existing fields ...
  notes     String  @default("")
  sortOrder Int     @default(0)
}
```

Migration required. Existing projects will get `sortOrder = 0` (all equal); the first drag will establish order.

---

## API Changes

### New: `GET /api/projects/[id]`
Returns a single project with its tasks. Used by the detail page server fetch.

```ts
// Response: Project & { tasks: Task[] }
```

### New: `PATCH /api/projects/[id]`
Accepts any subset of `{ name, deadline, notes, sortOrder }`. Used by:
- Inline name/deadline editing on the detail page
- Auto-saving notes
- Drag-to-sort order updates from the list page

```ts
// Body (all fields optional):
{ name?: string, deadline?: string | null, notes?: string, sortOrder?: number }
```

### Updated: `GET /api/projects`
Order by `sortOrder asc` instead of `createdAt desc`.

---

## Feature 1: Drag-to-sort

### Library
`@hello-pangea/dnd` — maintained fork of react-beautiful-dnd. Chosen for minimal setup with vertical list reordering and smooth animations.

### UI
- A six-dots grip icon (`GripVertical` from lucide-react) appears on the left of each project card.
- The entire card is draggable via this handle.
- While dragging, the card shows a subtle shadow/lift effect (provided by the library).

### Persistence
On `onDragEnd`:
1. Recompute integer `sortOrder` values for all projects (index 0, 1, 2, …).
2. PATCH only the projects whose `sortOrder` changed.
3. Optimistically update local state immediately; API calls happen in the background.

---

## Feature 2: Project Detail Page

### Route
`app/projects/[id]/page.tsx` — client component (`"use client"`), matching the existing pattern of all pages in this app.

- Fetches the project (with tasks) via `GET /api/projects/[id]` on mount with `useEffect`.
- Shows a loading state while fetching.
- If the project is not found (404 response), renders a "Project not found" message with a back link.

### Navigation
- The projects list page (`/projects`) adds an open/arrow icon button to each project card that links to `/projects/[id]`.
- The detail page has a `← Projects` back link at the top.

### Header (inline editable)
- **Project name**: displayed as a heading. Click to switch to an `<input>`, blur or Enter saves via PATCH. Escape cancels.
- **Deadline**: displayed as a date string. Same click-to-edit pattern with a `<input type="date">`.
- **Progress bar**: shows done/total task count, same as the list page.
- **Delete button**: deletes the project (with confirm dialog), then redirects to `/projects`.

### Two-column body layout

```
[ Tasks (60%)          ] [ Notes (40%)          ]
[ task list + add form ] [ textarea + saved hint ]
```

On screens narrower than `md` breakpoint, columns stack vertically (tasks above, notes below).

### Tasks column
- Identical task list to the expanded view on the list page (check/uncheck, edit inline, delete, sprint badge, urgency badge, estimated time).
- "Add task" button at the bottom opens the same inline add-task form.
- Tasks sorted by deadline ascending (nulls last), matching current list-page behaviour.

### Notes column
- A full-height `<textarea>` with no fixed height limit — scrollable.
- Auto-saves on a **1-second debounce** after each keystroke via `PATCH /api/projects/[id]`.
- Status indicator below the textarea: shows "Saving…" while the request is in flight, "Saved" on success, "Save failed" on error.
- Initial value loaded from the project's `notes` field.

---

## Out of Scope
- Notes formatting (markdown, rich text) — plain text only.
- Task drag-to-sort within the detail page — tasks remain sorted by deadline.
- Project archiving or status — not part of this feature.
