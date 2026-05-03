# Daily / Projects / Time Log Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-reorder + inline edit to the Due Very Soon box, persisted drag-to-reorder + "show in all views" flag to project tasks, and filter the Time Log to completed tasks only.

**Architecture:** One Prisma migration adds `showInRegular` and `sortOrder` to Task. The tasks GET API is widened to include flagged project tasks. Three pages are updated: `time/page.tsx` (filter only), `daily/page.tsx` (drag + edit), and `projects/[id]/page.tsx` (drag + flag). `@hello-pangea/dnd` is already installed.

**Tech Stack:** Next.js 16 App Router, Prisma 5, TypeScript, `@hello-pangea/dnd`, Tailwind CSS, lucide-react

---

## File Map

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `showInRegular Boolean @default(false)` and `sortOrder Int @default(0)` to Task model |
| `app/api/tasks/route.ts` | Widen GET WHERE to include `showInRegular: true` tasks |
| `app/api/tasks/[id]/route.ts` | Handle `showInRegular` and `sortOrder` in PATCH |
| `app/api/projects/[id]/route.ts` | Order tasks by `sortOrder ASC, deadline ASC` |
| `app/time/page.tsx` | Filter picker and table to `t.done` only |
| `app/daily/page.tsx` | Add drag-to-reorder + inline edit to Due Very Soon box |
| `app/projects/[id]/page.tsx` | Add drag-to-reorder + showInRegular toggle to task list |

---

## Task 1: Prisma migration — add `showInRegular` and `sortOrder` to Task

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two fields to the Task model**

In `prisma/schema.prisma`, find the `model Task {` block. After the `pinned` line, add:

```prisma
  showInRegular Boolean  @default(false)
  sortOrder     Int      @default(0)
```

The relevant section of the model should look like:

```prisma
model Task {
  id            String    @id @default(cuid())
  userId        String
  projectId     String?
  project       Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name          String
  leadDays      Int       @default(0)
  deadline      DateTime?
  scheduledDate DateTime?
  workCategory  String    @default("STANDARD")
  sprint        Int
  estMinutes    Int       @default(30)
  actualMinutes Int?
  pinned        Boolean   @default(false)
  showInRegular Boolean   @default(false)
  sortOrder     Int       @default(0)
  done          Boolean   @default(false)
  doneAt        DateTime?
  reminderId    String?
  syncedFrom    String    @default("app")
  createdAt     DateTime  @default(now())
  timeLogs      TimeLog[]

  @@unique([userId, reminderId])
}
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add-task-show-in-regular-sort-order
```

Expected output:
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database ...

Applying migration `..._add_task_show_in_regular_sort_order`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ ..._add_task_show_in_regular_sort_order/
    └─ migration.sql

Your database is now in sync with your schema.
```

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or same errors as before migration if any pre-existed).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add showInRegular and sortOrder fields to Task"
```

---

## Task 2: Update tasks GET API — include showInRegular tasks

**Files:**
- Modify: `app/api/tasks/route.ts`

- [ ] **Step 1: Update the WHERE clause**

Replace the entire `GET` function in `app/api/tasks/route.ts`:

```ts
export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [{ projectId: null }, { showInRegular: true }],
    },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/route.ts
git commit -m "feat: include showInRegular tasks in tasks GET API"
```

---

## Task 3: Update tasks PATCH API — handle `showInRegular` and `sortOrder`

**Files:**
- Modify: `app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Add the two new fields to the PATCH handler**

In `app/api/tasks/[id]/route.ts`, after the existing `if ("pinned" in body)` guard, add:

```ts
if ("showInRegular" in body) data.showInRegular = Boolean(body.showInRegular);
if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder);
```

The full `data` population block should now look like:

```ts
if ("pinned" in body) data.pinned = Boolean(body.pinned);
if ("showInRegular" in body) data.showInRegular = Boolean(body.showInRegular);
if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder);
if ("done" in body) {
  data.done = body.done;
  data.doneAt = body.done ? new Date() : null;
}
if ("name" in body) data.name = body.name;
if ("sprint" in body) data.sprint = Number(body.sprint);
if ("estMinutes" in body) data.estMinutes = Number(body.estMinutes);
if ("actualMinutes" in body)
  data.actualMinutes = body.actualMinutes ? Number(body.actualMinutes) : null;
if ("workCategory" in body) data.workCategory = body.workCategory;
if ("leadDays" in body) data.leadDays = Number(body.leadDays);
if ("reminderId" in body) data.reminderId = body.reminderId ?? null;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/[id]/route.ts
git commit -m "feat: handle showInRegular and sortOrder in tasks PATCH"
```

---

## Task 4: Update projects/[id] API — order tasks by sortOrder

**Files:**
- Modify: `app/api/projects/[id]/route.ts`

- [ ] **Step 1: Update the task orderBy in GET**

In `app/api/projects/[id]/route.ts`, find the `GET` function. Change the `include` clause from:

```ts
include: { tasks: { orderBy: { deadline: "asc" } } },
```

to:

```ts
include: {
  tasks: {
    orderBy: [{ sortOrder: "asc" }, { deadline: "asc" }],
  },
},
```

Apply the same change in the `PATCH` function — it also includes tasks. The PATCH currently has:

```ts
include: { tasks: { orderBy: { deadline: "asc" } } },
```

Change to:

```ts
include: {
  tasks: {
    orderBy: [{ sortOrder: "asc" }, { deadline: "asc" }],
  },
},
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/[id]/route.ts
git commit -m "feat: order project tasks by sortOrder then deadline"
```

---

## Task 5: Time Log — filter to completed tasks only

**Files:**
- Modify: `app/time/page.tsx`

- [ ] **Step 1: Update the task picker filter**

In `app/time/page.tsx`, find the `SelectContent` inside the "Log actual time" form (around line 110). Change:

```tsx
{tasks
  .filter((t) => !t.done)
  .map((t) => (
    <SelectItem key={t.id} value={t.id}>
      {t.name}
    </SelectItem>
  ))}
```

to:

```tsx
{tasks
  .filter((t) => t.done)
  .map((t) => (
    <SelectItem key={t.id} value={t.id}>
      {t.name}
    </SelectItem>
  ))}
```

- [ ] **Step 2: Update the Estimated vs Actual table filter**

In the same file, find the table body (around line 165). Change:

```tsx
{tasks.filter((t) => t.actualMinutes != null).length === 0 ? (
```

to:

```tsx
{tasks.filter((t) => t.done && t.actualMinutes != null).length === 0 ? (
```

And change the `.map` filter immediately below:

```tsx
tasks
  .filter((t) => t.actualMinutes != null)
  .map((task) => {
```

to:

```tsx
tasks
  .filter((t) => t.done && t.actualMinutes != null)
  .map((task) => {
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/time/page.tsx
git commit -m "feat: filter time log to completed tasks only"
```

---

## Task 6: Daily page — Due Very Soon drag-to-reorder

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `app/daily/page.tsx`, add the dnd import after the existing imports:

```tsx
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
```

`GripVertical` can be added to the existing lucide-react import line. Add it to the destructured list:

```tsx
import {
  Sparkles,
  CheckCircle2,
  Circle,
  Plus,
  Loader2,
  Clock,
  Moon,
  CalendarClock,
  Zap,
  ChevronDown,
  ChevronUp,
  Trophy,
  GripVertical,
} from "lucide-react";
```

And add the dnd import as a new import line:

```tsx
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
```

- [ ] **Step 2: Add urgentCustomOrder state**

Inside `DailyPage`, after the existing `useState` declarations (after `addingToGain`), add:

```tsx
const [urgentCustomOrder, setUrgentCustomOrder] = useState<string[]>([]);
```

- [ ] **Step 3: Add a sync effect for urgentCustomOrder**

After the `loadData` `useEffect`, add a new effect that syncs the custom order whenever the urgent task set changes. Place this after the computed `urgentNow` constant but before the `return` statement — actually, since `urgentNow` is derived inline, add this effect right after all the `useEffect` hooks and before the computed constants:

Add this effect after the `useEffect(() => { loadData(); }, [loadData]);` block:

```tsx
// Keep urgentCustomOrder in sync when tasks change (preserves manual order, appends new items)
useEffect(() => {
  const urgentIds = new Set(
    openTasks
      .filter((t) => {
        if (!t.deadline) return false;
        return startOfDay(parseISO(t.deadline)) <= today;
      })
      .map((t) => t.id)
  );
  setUrgentCustomOrder((prev) => {
    const kept = prev.filter((id) => urgentIds.has(id));
    const keptSet = new Set(kept);
    const newIds = [...urgentIds].filter((id) => !keptSet.has(id));
    return [...kept, ...newIds];
  });
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [tasks]);
```

- [ ] **Step 4: Add handleUrgentDragEnd function**

Inside `DailyPage`, after `addToGain`, add:

```tsx
function handleUrgentDragEnd(result: DropResult) {
  if (!result.destination) return;
  setUrgentCustomOrder((prev) => {
    const next = [...prev];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination!.index, 0, moved);
    return next;
  });
}
```

- [ ] **Step 5: Derive urgentDisplayed**

In the computed constants section, `urgentNow` stays as-is. Add a new derived value right after it:

```tsx
const urgentDisplayed =
  urgentCustomOrder.length > 0
    ? urgentCustomOrder
        .map((id) => urgentNow.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined)
    : urgentNow;
```

- [ ] **Step 6: Replace the Due Very Soon list with drag-enabled version**

Find the Due Very Soon section in the JSX (the `<div className="divide-y divide-red-100 dark:divide-red-900">` block). Replace it:

```tsx
<DragDropContext onDragEnd={handleUrgentDragEnd}>
  <Droppable droppableId="urgent-now">
    {(provided) => (
      <div
        className="divide-y divide-red-100 dark:divide-red-900"
        ref={provided.innerRef}
        {...provided.droppableProps}
      >
        {urgentDisplayed.map((task, index) => {
          const dl = task.deadline ? startOfDay(parseISO(task.deadline)) : null;
          const daysLeft = dl ? differenceInCalendarDays(dl, today) : null;
          return (
            <Draggable key={task.id} draggableId={task.id} index={index}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-950"
                  style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}`, ...provided.draggableProps.style }}
                >
                  <span
                    {...provided.dragHandleProps}
                    className="text-red-200 dark:text-red-900 cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <button onClick={() => toggleTask(task.id, true)}>
                    <Circle className="h-4 w-4 text-red-300 hover:text-green-500 transition-colors" />
                  </button>
                  <span className="flex-1 text-sm font-medium">{task.name}</span>
                  {task.workCategory === "GRADING" && (
                    <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  )}
                  {task.project && (
                    <span className="text-xs text-slate-400 dark:text-zinc-500 hidden sm:block shrink-0">{task.project.name}</span>
                  )}
                  <span className={`text-xs font-semibold shrink-0 ${
                    daysLeft !== null && daysLeft < 0 ? "text-red-600" :
                    daysLeft === 0 ? "text-red-600" : "text-amber-600"
                  }`}>
                    {daysLeft === null ? "" :
                     daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
                     daysLeft === 0 ? "due today" :
                     "due tomorrow"}
                  </span>
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                </div>
              )}
            </Draggable>
          );
        })}
        {provided.placeholder}
      </div>
    )}
  </Droppable>
</DragDropContext>
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: drag-to-reorder Due Very Soon box on Daily page"
```

---

## Task 7: Daily page — Due Very Soon inline edit

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Add edit state variables**

Inside `DailyPage`, after the `urgentCustomOrder` state, add:

```tsx
const [editingUrgentId, setEditingUrgentId] = useState<string | null>(null);
const [editUrgentName, setEditUrgentName] = useState("");
const [editUrgentSprint, setEditUrgentSprint] = useState("1");
const [editUrgentDeadline, setEditUrgentDeadline] = useState("");
const [editUrgentEst, setEditUrgentEst] = useState("30");
```

Add `Pencil`, `Check`, `X` to the lucide-react import (if not already present):

```tsx
import {
  Sparkles, CheckCircle2, Circle, Plus, Loader2, Clock, Moon,
  CalendarClock, Zap, ChevronDown, ChevronUp, Trophy,
  GripVertical, Pencil, Check, X,
} from "lucide-react";
```

Also add the `SPRINT_LABELS` import if not already present — check the existing utils import line and add it:

```tsx
import {
  formatMinutes,
  formatRelativeDate,
  SPRINT_LABELS,
  SPRINT_COLORS,
} from "@/lib/utils";
```

- [ ] **Step 2: Add startEditUrgent and saveEditUrgent functions**

After `handleUrgentDragEnd`, add:

```tsx
function startEditUrgent(task: Task) {
  setEditingUrgentId(task.id);
  setEditUrgentName(task.name);
  setEditUrgentSprint(String(task.sprint));
  setEditUrgentDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
  setEditUrgentEst(String(task.estMinutes));
}

async function saveEditUrgent(taskId: string) {
  await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: editUrgentName,
      sprint: parseInt(editUrgentSprint),
      deadline: editUrgentDeadline || null,
      estMinutes: parseInt(editUrgentEst),
    }),
  });
  setEditingUrgentId(null);
  loadData();
}
```

- [ ] **Step 3: Update the Draggable row to show edit form or read view**

Inside the `Draggable` render in the Due Very Soon section, replace the inner `<div>` content with a conditional:

```tsx
{(provided) => (
  <div
    ref={provided.innerRef}
    {...provided.draggableProps}
    className="bg-white dark:bg-zinc-950"
    style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}`, ...provided.draggableProps.style }}
  >
    {editingUrgentId === task.id ? (
      <div className="px-4 py-3 space-y-2 bg-red-50 dark:bg-red-950">
        <Input
          value={editUrgentName}
          onChange={(e) => setEditUrgentName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEditUrgent(task.id);
            if (e.key === "Escape") setEditingUrgentId(null);
          }}
          autoFocus
          className="text-sm"
        />
        <div className="flex items-center gap-2">
          <Select value={editUrgentSprint} onValueChange={setEditUrgentSprint}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((s) => (
                <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={editUrgentDeadline}
            onChange={(e) => setEditUrgentDeadline(e.target.value)}
            className="h-8 text-xs w-36"
          />
          <Input
            type="number"
            min="5"
            step="5"
            value={editUrgentEst}
            onChange={(e) => setEditUrgentEst(e.target.value)}
            className="h-8 text-xs w-24"
            placeholder="Est. mins"
          />
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setEditingUrgentId(null)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={() => saveEditUrgent(task.id)}>
              <Check className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-3 px-4 py-2.5 group">
        <span
          {...provided.dragHandleProps}
          className="text-red-200 dark:text-red-900 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button onClick={() => toggleTask(task.id, true)}>
          <Circle className="h-4 w-4 text-red-300 hover:text-green-500 transition-colors" />
        </button>
        <span className="flex-1 text-sm font-medium">{task.name}</span>
        {task.workCategory === "GRADING" && (
          <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        )}
        {task.project && (
          <span className="text-xs text-slate-400 dark:text-zinc-500 hidden sm:block shrink-0">{task.project.name}</span>
        )}
        <span className={`text-xs font-semibold shrink-0 ${
          daysLeft !== null && daysLeft < 0 ? "text-red-600" :
          daysLeft === 0 ? "text-red-600" : "text-amber-600"
        }`}>
          {daysLeft === null ? "" :
           daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
           daysLeft === 0 ? "due today" :
           "due tomorrow"}
        </span>
        <SprintBadge sprint={task.sprint} size="sm" />
        <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
        <button
          onClick={() => startEditUrgent(task)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 text-red-300 hover:text-red-600 transition-colors shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    )}
  </div>
)}
```

Note: `daysLeft` is computed before the `return` for the Draggable, so move its computation into the map callback before the return:

```tsx
{urgentDisplayed.map((task, index) => {
  const dl = task.deadline ? startOfDay(parseISO(task.deadline)) : null;
  const daysLeft = dl ? differenceInCalendarDays(dl, today) : null;
  return (
    <Draggable key={task.id} draggableId={task.id} index={index}>
      {/* ... */}
    </Draggable>
  );
})}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: inline edit for Due Very Soon tasks on Daily page"
```

---

## Task 8: Project detail — drag-to-reorder tasks

**Files:**
- Modify: `app/projects/[id]/page.tsx`

- [ ] **Step 1: Add imports**

Add to the existing lucide-react import:

```tsx
import {
  Plus, Trash2, CheckCircle2, Circle, Pencil, Check, X,
  Moon, CalendarClock, Wand2, ChevronLeft, GripVertical,
} from "lucide-react";
```

Add the dnd import:

```tsx
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
```

- [ ] **Step 2: Remove the client-side deadline re-sort**

In `app/projects/[id]/page.tsx`, find the `sortedTasks` computed constant (around line 271):

```ts
const sortedTasks = [...project.tasks].sort((a, b) => {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
});
```

Replace it with:

```ts
const sortedTasks = project.tasks;
```

The API now returns tasks pre-sorted by `sortOrder ASC, deadline ASC`, so the client-side re-sort is no longer needed — and it would defeat drag reordering by re-sorting on every render.

- [ ] **Step 3: Add handleTaskDragEnd function**

In `ProjectDetailPage`, after `addTask`, add:

```tsx
async function handleTaskDragEnd(result: DropResult) {
  if (!result.destination || !project) return;
  const reordered = [...sortedTasks];
  const [moved] = reordered.splice(result.source.index, 1);
  reordered.splice(result.destination.index, 0, moved);

  // Optimistically update local state
  setProject((p) => p ? { ...p, tasks: reordered } : p);

  // Persist new sortOrder for each task
  await Promise.all(
    reordered.map((task, index) =>
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: index }),
      })
    )
  );
}
```

- [ ] **Step 3: Wrap task list in DragDropContext**

In the JSX, find the `<div className="divide-y divide-zinc-100 dark:divide-zinc-800">` that contains the task rows (inside the Tasks card). Replace it with:

```tsx
<DragDropContext onDragEnd={handleTaskDragEnd}>
  <Droppable droppableId="project-tasks">
    {(provided) => (
      <div
        className="divide-y divide-zinc-100 dark:divide-zinc-800"
        ref={provided.innerRef}
        {...provided.droppableProps}
      >
        {sortedTasks.length === 0 && !addingTask && (
          <p className="px-4 py-3 text-sm text-zinc-400">No tasks yet.</p>
        )}

        {sortedTasks.map((task, index) =>
          editingTaskId === task.id ? (
            <div key={task.id} className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
              {/* existing edit form — unchanged */}
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditTask(task.id);
                  if (e.key === "Escape") setEditingTaskId(null);
                }}
                autoFocus
                className="text-sm"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
                  <Select value={editSprint} onValueChange={setEditSprint}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((s) => (
                        <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Category</label>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                      <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Deadline</label>
                  <Input type="date" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Lead days</label>
                  <Input type="number" min="0" value={editLeadDays} onChange={(e) => setEditLeadDays(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="space-y-1 w-28">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Est. mins</label>
                  <Input type="number" min="5" step="5" value={editEst} onChange={(e) => setEditEst(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="flex gap-2 justify-end flex-1 items-end pb-0.5">
                  <Button variant="ghost" size="sm" onClick={() => setEditingTaskId(null)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={() => saveEditTask(task.id)}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Draggable key={task.id} draggableId={task.id} index={index}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  className={`flex items-center gap-3 px-4 py-2.5 group ${task.done ? "opacity-50" : ""}`}
                >
                  <span
                    {...provided.dragHandleProps}
                    className="text-zinc-200 dark:text-zinc-700 cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <button onClick={() => toggleTask(task.id, !task.done)}>
                    {task.done
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <Circle className="h-4 w-4 text-zinc-300 hover:text-green-500 transition-colors" />}
                  </button>
                  <span className={`flex-1 text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
                  {task.workCategory === "GRADING" && <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                  {task.scheduledDate && (
                    <span className="text-xs text-zinc-400 shrink-0 flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {formatRelativeDate(task.scheduledDate)}
                    </span>
                  )}
                  {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-zinc-400 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                  <button
                    onClick={() => startEditTask(task)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </Draggable>
          )
        )}
        {provided.placeholder}

        {/* Add task — outside Droppable items but inside the container */}
        {addingTask ? (
          <div className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
            {/* existing add task form — unchanged */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-500">New task</span>
              {presets.length > 0 && (
                <Select onValueChange={applyPreset}>
                  <SelectTrigger className="h-7 text-xs w-44 gap-1">
                    <Wand2 className="h-3 w-3 text-zinc-400 shrink-0" />
                    <SelectValue placeholder="Use a preset…" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Input
              placeholder="Task name"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask();
                if (e.key === "Escape") setAddingTask(false);
              }}
              autoFocus
              className="text-sm"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
                <Select value={newTaskSprint} onValueChange={setNewTaskSprint}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-zinc-400">Category</label>
                <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                    <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-zinc-400">Deadline</label>
                <Input type="date" value={newTaskDeadline} onChange={(e) => setNewTaskDeadline(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-zinc-400">Est. mins</label>
                <Input type="number" min="5" step="5" value={newTaskEst} onChange={(e) => setNewTaskEst(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setAddingTask(false)}>Cancel</Button>
              <Button size="sm" onClick={addTask} disabled={!newTaskName.trim()}>Add task</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setAddingTask(true);
              setNewTaskName(""); setNewTaskSprint("4"); setNewTaskEst("30");
              setNewTaskDeadline(""); setNewTaskCategory("STANDARD"); setNewTaskLeadDays("0");
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>
        )}
      </div>
    )}
  </Droppable>
</DragDropContext>
```

Note: The `addingTask` form and "Add task" button must be **inside** the `<div>` passed to `provided.innerRef` but **outside** the `Draggable` items. Keep `{provided.placeholder}` between the last Draggable and the add-task button.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/projects/[id]/page.tsx
git commit -m "feat: drag-to-reorder tasks in project detail page"
```

---

## Task 9: Project detail — showInRegular toggle

**Files:**
- Modify: `app/projects/[id]/page.tsx`

- [ ] **Step 1: Update the Task interface**

At the top of `app/projects/[id]/page.tsx`, update the `Task` interface to include the new field:

```ts
interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  leadDays: number;
  showInRegular: boolean;
}
```

- [ ] **Step 2: Add Globe to lucide-react imports**

```tsx
import {
  Plus, Trash2, CheckCircle2, Circle, Pencil, Check, X,
  Moon, CalendarClock, Wand2, ChevronLeft, GripVertical, Globe,
} from "lucide-react";
```

- [ ] **Step 3: Add toggleShowInRegular function**

After `handleTaskDragEnd`, add:

```tsx
async function toggleShowInRegular(taskId: string, current: boolean) {
  const next = !current;
  setProject((p) =>
    p ? { ...p, tasks: p.tasks.map((t) => t.id === taskId ? { ...t, showInRegular: next } : t) } : p
  );
  await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showInRegular: next }),
  });
}
```

- [ ] **Step 4: Add the Globe toggle button to the task row**

Inside the non-editing Draggable row (the read-view `<div className="flex items-center gap-3 px-4 py-2.5 group">`), add the Globe button between the `SprintBadge` and `estMinutes` span:

```tsx
<SprintBadge sprint={task.sprint} size="sm" />
<button
  onClick={() => toggleShowInRegular(task.id, task.showInRegular)}
  title={task.showInRegular ? "Shown in all views — click to hide" : "Show in all views"}
  className={`p-1 rounded transition-colors shrink-0 ${
    task.showInRegular
      ? "text-blue-500 hover:text-blue-700"
      : "text-zinc-200 dark:text-zinc-700 hover:text-zinc-400"
  }`}
>
  <Globe className="h-3.5 w-3.5" />
</button>
<span className="text-xs text-zinc-400 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/projects/[id]/page.tsx
git commit -m "feat: showInRegular toggle on project task rows"
```

---

## Task 10: Final verification and production deploy

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: clean exit (no errors).

- [ ] **Step 2: Start dev server and smoke test all three features**

```bash
npm run dev
```

Manual checks:
- **Time Log** (`/time`): task picker shows only completed tasks; table shows only completed tasks with logged time
- **Daily** (`/daily`): if any Due Very Soon tasks exist — grip handle visible, drag reorders them, pencil appears on hover, edit form saves correctly
- **Project** (`/projects/[id]`): grip handle visible, drag reorders with persistence on reload; Globe icon toggles blue and task appears in Daily/Focus/Sprints views

- [ ] **Step 3: Deploy to production**

```bash
vercel --prod
```

- [ ] **Step 4: Final commit if any tweaks were needed**

```bash
git add -p
git commit -m "fix: post-deploy tweaks"
```
