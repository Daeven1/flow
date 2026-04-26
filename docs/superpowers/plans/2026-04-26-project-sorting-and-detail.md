# Project Sorting + Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-sort reordering to the projects list (persisted to the database) and a full-page project detail view at `/projects/[id]` with an inline-editable header, task list, and auto-saving notes scratchpad.

**Architecture:** Add `notes` and `sortOrder` fields to the `Project` model via a Prisma migration. Add `GET` and `PATCH` endpoints for `/api/projects/[id]`. The projects list page gets `@hello-pangea/dnd` drag-to-sort with a grip handle and an open-project link. A new client component page at `app/projects/[id]/page.tsx` shows the project in a two-column layout (tasks 3/5, notes 2/5) with inline-editable name and deadline.

**Tech Stack:** Next.js 16 App Router, Prisma 5 + PostgreSQL, `@hello-pangea/dnd`, Tailwind CSS, lucide-react

---

## File Map

**Modify:**
- `prisma/schema.prisma` — add `notes String @default("")` and `sortOrder Int @default(0)` to `Project`
- `app/api/projects/route.ts` — change `orderBy` from `createdAt desc` to `sortOrder asc`
- `app/api/projects/[id]/route.ts` — add `GET` and `PATCH` handlers alongside existing `DELETE`
- `app/projects/page.tsx` — add `@hello-pangea/dnd` drag-to-sort, grip handle, open-project link

**Create:**
- `app/projects/[id]/page.tsx` — project detail page (client component)

---

### Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `notes` and `sortOrder` to the Project model**

In `prisma/schema.prisma`, replace the `Project` model:

```prisma
model Project {
  id          String    @id @default(cuid())
  userId      String
  name        String
  deadline    DateTime?
  templateKey String?
  createdAt   DateTime  @default(now())
  tasks       Task[]
}
```

with:

```prisma
model Project {
  id          String    @id @default(cuid())
  userId      String
  name        String
  deadline    DateTime?
  templateKey String?
  notes       String    @default("")
  sortOrder   Int       @default(0)
  createdAt   DateTime  @default(now())
  tasks       Task[]
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_project_notes_sortorder
```

Expected output contains: `migrations/..._add_project_notes_sortorder`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add notes and sortOrder fields to Project model"
```

---

### Task 2: Project API Routes

**Files:**
- Modify: `app/api/projects/route.ts`
- Modify: `app/api/projects/[id]/route.ts`

- [ ] **Step 1: Update list ordering in `GET /api/projects`**

In `app/api/projects/route.ts`, change:

```ts
  orderBy: { createdAt: "desc" },
```

to:

```ts
  orderBy: { sortOrder: "asc" },
```

- [ ] **Step 2: Rewrite `app/api/projects/[id]/route.ts`**

Replace the entire file contents with:

```ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id, userId },
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, deadline, notes, sortOrder } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
  if (notes !== undefined) data.notes = notes;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  const project = await prisma.project.update({
    where: { id, userId },
    data,
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  return NextResponse.json(project);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.project.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/projects/route.ts app/api/projects/[id]/route.ts
git commit -m "feat: add GET and PATCH project endpoints, order list by sortOrder"
```

---

### Task 3: Drag-to-Sort + Open Button on Projects List Page

**Files:**
- Modify: `app/projects/page.tsx`

- [ ] **Step 1: Install `@hello-pangea/dnd`**

```bash
npm install @hello-pangea/dnd
```

Expected: Package added to `node_modules` and `package.json`.

- [ ] **Step 2: Update imports at the top of `app/projects/page.tsx`**

Replace the existing import block:

```ts
import { useState, useEffect, useCallback } from "react";
```

with:

```ts
import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import Link from "next/link";
```

Replace the existing lucide-react import:

```ts
import {
  Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Pencil, Check, X, BookmarkPlus, Moon, CalendarClock, Wand2,
} from "lucide-react";
```

with:

```ts
import {
  Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Pencil, Check, X, BookmarkPlus, Moon, CalendarClock, Wand2,
  GripVertical, ArrowUpRight,
} from "lucide-react";
```

- [ ] **Step 3: Add `handleDragEnd` inside `ProjectsPage`**

Add this function after the `toggleExpand` function (around line 219):

```tsx
  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const reordered = Array.from(projects);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setProjects(reordered);

    await Promise.all(
      reordered.map((p, i) =>
        fetch(`/api/projects/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        })
      )
    );
  }
```

- [ ] **Step 4: Replace the projects list section with drag-to-sort wrapper**

Find this block in the JSX (the `else` branch of the `projects.length === 0` check, around line 294):

```tsx
        <div className="space-y-3">
          {projects.map((project) => {
```

Replace those two lines with:

```tsx
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="projects">
            {(provided) => (
              <div
                className="space-y-3"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {projects.map((project, index) => {
```

(The three `const` lines — `donePct`, `isExpanded`, `sortedTasks` — stay unchanged. Only the map signature changes from `(project)` to `(project, index)`.)

Then find the `return (` inside the map, which currently opens with:

```tsx
            return (
              <div key={project.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                {/* Project header */}
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => toggleExpand(project.id)} className="text-zinc-400">
```

Replace those lines with:

```tsx
                return (
                  <Draggable key={project.id} draggableId={project.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 ${
                          snapshot.isDragging ? "shadow-lg" : ""
                        }`}
                      >
                        {/* Project header */}
                        <div className="flex items-center gap-3 p-4">
                          <div
                            {...provided.dragHandleProps}
                            className="text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0"
                          >
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <button onClick={() => toggleExpand(project.id)} className="text-zinc-400">
```

- [ ] **Step 5: Add the open-project link button in the header action area**

In the project header, find the existing `BookmarkPlus` button:

```tsx
                  <button
                    onClick={() => { setSavingTemplate(project.id); setTemplateName(project.name); setTemplateDesc(""); }}
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-500 transition-colors"
                    title="Save as template"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                  </button>
```

Add the following `Link` immediately before it:

```tsx
                  <Link
                    href={`/projects/${project.id}`}
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    title="Open project"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => { setSavingTemplate(project.id); setTemplateName(project.name); setTemplateDesc(""); }}
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-500 transition-colors"
                    title="Save as template"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                  </button>
```

- [ ] **Step 6: Close the Draggable, Droppable, and DragDropContext wrappers**

Find the closing `</div>` of the project card — it is the `</div>` that closes the outermost card element (after the `{isExpanded && (...)}` block). Currently it reads:

```tsx
            </div>
          );
        })}
      </div>
```

Replace those lines with:

```tsx
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

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 8: Manual test — drag-to-sort and open link**

Run `npm run dev`, open `/projects`, and verify:
- A grip icon appears on the left of each project card
- Dragging reorders projects with a smooth animation
- After refreshing the page, the new order is preserved
- The `↗` icon opens `/projects/[id]`

- [ ] **Step 9: Commit**

```bash
git add app/projects/page.tsx package.json package-lock.json
git commit -m "feat: add drag-to-sort with persisted order and open-project link"
```

---

### Task 4: Project Detail Page

**Files:**
- Create: `app/projects/[id]/page.tsx`

- [ ] **Step 1: Create `app/projects/[id]/page.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMinutes, SPRINT_LABELS, formatRelativeDate } from "@/lib/utils";
import {
  Plus, Trash2, CheckCircle2, Circle, Pencil, Check, X,
  Moon, CalendarClock, Wand2, ChevronLeft,
} from "lucide-react";
import { format, parseISO } from "date-fns";

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
}

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  templateKey: string | null;
  notes: string;
  tasks: Task[];
}

interface Preset {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState("");

  const [notes, setNotes] = useState("");
  const [notesStatus, setNotesStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSprint, setEditSprint] = useState("4");
  const [editDeadline, setEditDeadline] = useState("");
  const [editScheduled, setEditScheduled] = useState("");
  const [editEst, setEditEst] = useState("30");
  const [editCategory, setEditCategory] = useState("STANDARD");
  const [editLeadDays, setEditLeadDays] = useState("0");

  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskSprint, setNewTaskSprint] = useState("4");
  const [newTaskEst, setNewTaskEst] = useState("30");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("STANDARD");
  const [newTaskLeadDays, setNewTaskLeadDays] = useState("0");

  const load = useCallback(async () => {
    const [projRes, presetsRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch("/api/presets"),
    ]);
    if (projRes.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const proj: Project = await projRes.json();
    setProject(proj);
    setNameValue(proj.name);
    setDeadlineValue(proj.deadline ? proj.deadline.slice(0, 10) : "");
    setNotes(proj.notes ?? "");
    setPresets(await presetsRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveName() {
    if (!project) return;
    setEditingName(false);
    if (nameValue === project.name) return;
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue }),
    });
    setProject((p) => p ? { ...p, name: nameValue } : p);
  }

  async function saveDeadline() {
    if (!project) return;
    setEditingDeadline(false);
    const newDeadline = deadlineValue || null;
    const current = project.deadline ? project.deadline.slice(0, 10) : null;
    if (newDeadline === current) return;
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline: newDeadline }),
    });
    setProject((p) => p ? { ...p, deadline: newDeadline } : p);
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    setNotesStatus("saving");
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        setNotesStatus("saved");
      } catch {
        setNotesStatus("error");
      }
    }, 1000);
  }

  async function deleteProject() {
    if (!confirm("Delete this project and all its tasks?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/projects");
  }

  async function toggleTask(taskId: string, done: boolean) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditName(task.name);
    setEditSprint(String(task.sprint));
    setEditDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setEditScheduled(task.scheduledDate ? task.scheduledDate.slice(0, 10) : "");
    setEditEst(String(task.estMinutes));
    setEditCategory(task.workCategory);
    setEditLeadDays(String(task.leadDays));
  }

  async function saveEditTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        sprint: parseInt(editSprint),
        deadline: editDeadline || null,
        scheduledDate: editScheduled || null,
        estMinutes: parseInt(editEst),
        workCategory: editCategory,
        leadDays: parseInt(editLeadDays),
      }),
    });
    setEditingTaskId(null);
    load();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    load();
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setNewTaskName(preset.name);
    setNewTaskSprint(String(preset.sprint));
    setNewTaskEst(String(preset.estMinutes));
    setNewTaskCategory(preset.workCategory);
  }

  async function addTask() {
    if (!newTaskName.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        name: newTaskName,
        sprint: newTaskSprint,
        estMinutes: newTaskEst,
        deadline: newTaskDeadline || null,
        workCategory: newTaskCategory,
        leadDays: parseInt(newTaskLeadDays),
      }),
    });
    setNewTaskName(""); setNewTaskDeadline(""); setNewTaskLeadDays("0");
    setAddingTask(false);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400 text-sm">
        Loading…
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="space-y-4">
        <Link
          href="/projects"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Projects
        </Link>
        <p className="text-zinc-400 text-sm">Project not found.</p>
      </div>
    );
  }

  const sortedTasks = [...project.tasks].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
  });

  const donePct = project.tasks.length > 0
    ? Math.round((project.tasks.filter((t) => t.done).length / project.tasks.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors w-fit"
      >
        <ChevronLeft className="h-4 w-4" /> Projects
      </Link>

      {/* Header card */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 space-y-3">
        {editingName ? (
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") { setEditingName(false); setNameValue(project.name); }
            }}
            autoFocus
            className="text-xl font-bold h-auto py-1"
          />
        ) : (
          <h1
            className="text-xl font-bold text-slate-900 dark:text-white cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setEditingName(true)}
            title="Click to edit"
          >
            {project.name}
          </h1>
        )}

        <div className="flex items-center gap-3">
          {editingDeadline ? (
            <Input
              type="date"
              value={deadlineValue}
              onChange={(e) => setDeadlineValue(e.target.value)}
              onBlur={saveDeadline}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDeadline();
                if (e.key === "Escape") {
                  setEditingDeadline(false);
                  setDeadlineValue(project.deadline ? project.deadline.slice(0, 10) : "");
                }
              }}
              autoFocus
              className="h-8 text-xs w-40"
            />
          ) : (
            <span
              className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              onClick={() => setEditingDeadline(true)}
              title="Click to edit deadline"
            >
              {project.deadline
                ? `Due ${format(new Date(project.deadline), "d MMM yyyy")}`
                : "No deadline — click to add"}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={deleteProject}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
            title="Delete project"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-full bg-green-500 rounded transition-all"
              style={{ width: `${donePct}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400 tabular-nums">
            {project.tasks.filter((t) => t.done).length}/{project.tasks.length}
          </span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

        {/* Tasks — 3/5 width */}
        <div className="md:col-span-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="font-medium text-sm">Tasks</h2>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sortedTasks.length === 0 && !addingTask && (
              <p className="px-4 py-3 text-sm text-zinc-400">No tasks yet.</p>
            )}

            {sortedTasks.map((task) =>
              editingTaskId === task.id ? (
                <div key={task.id} className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
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
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-2.5 group ${task.done ? "opacity-50" : ""}`}
                >
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
              )
            )}

            {/* Add task */}
            {addingTask ? (
              <div className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
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
        </div>

        {/* Notes — 2/5 width */}
        <div className="md:col-span-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="font-medium text-sm">Notes</h2>
          </div>
          <div className="flex flex-col flex-1 p-4 gap-2">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Project notes, reminders, context…"
              className="flex-1 min-h-[200px] w-full resize-none rounded border border-zinc-200 dark:border-zinc-700 bg-transparent p-3 text-sm text-slate-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
            <p className="text-xs text-zinc-400">
              {notesStatus === "saving" && "Saving…"}
              {notesStatus === "saved" && "Saved"}
              {notesStatus === "error" && "Save failed"}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build completes with no TypeScript or Next.js errors.

- [ ] **Step 3: Manual test — detail page**

Run `npm run dev`, navigate to `/projects`, click the `↗` icon on any project, and verify:
- Project name and deadline display correctly
- Clicking the name switches to an input; Enter or blur saves, Escape cancels
- Clicking the deadline switches to a date input; same keyboard behaviour
- Tasks list displays with check, edit, and delete controls that work correctly
- Adding a task via the form works and the list refreshes
- Typing in the Notes textarea shows "Saving…", then "Saved" after ~1 second
- Notes content persists after a page refresh
- Clicking the trash icon, confirming, deletes the project and redirects to `/projects`
- Progress bar reflects the correct done/total ratio

- [ ] **Step 4: Commit**

```bash
git add app/projects/[id]/page.tsx
git commit -m "feat: add project detail page with tasks and auto-saving notes"
```
