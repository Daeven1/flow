# Grove UI Refresh & Recurring Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the app's visual theme (new backgrounds, renamed/restyled Sunshine + Sprout sections, reordered daily page) and add recurring tasks that auto-spawn daily/weekly/monthly from templates managed in the Tasks pane.

**Architecture:** Two independent parts — (1) UI-only changes to `layout.tsx` and `daily/page.tsx`; (2) recurring tasks: new `RecurringTask` Prisma model, three API routes, spawn awaited before task fetch on both daily and tasks pages, and a collapsible Recurring section in the Tasks pane. Spawn uses an idempotent check (recurringTaskId + scheduledDate) so page refreshes never duplicate tasks.

**Tech Stack:** Next.js 16 App Router, Prisma ORM (PostgreSQL via `prisma db push`), Tailwind CSS arbitrary values, shadcn/ui (Button, Input, Select), Lucide React icons, date-fns.

---

## Part 1: UI Refresh

### Task 1: App background colours

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update body background and viewport themeColor**

In `app/layout.tsx`, replace the `viewport` export and the `<body>` className:

```tsx
// Replace the viewport export (currently lines 10-12)
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E0EFFE" },
    { media: "(prefers-color-scheme: dark)", color: "#0D1B2E" },
  ],
};
```

```tsx
// Replace the body className (currently line 46)
<body
  className={`${inter.className} bg-[#E0EFFE] dark:bg-[#0D1B2E] text-slate-900 dark:text-zinc-100 min-h-screen`}
>
```

The personal mode override in `globals.css` (`html.personal-mode:not(.dark) body { background-color: rgb(254 252 232) }`) uses a more specific selector than Tailwind's class, so it continues to win in personal mode — no change needed there.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: update app background to Calm Pool / Midnight Navy"
```

---

### Task 2: Rename + restyle Sunshine and Sprout, reorder daily page sections

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Move the Sunshine + Sprout grid to after the parsed tasks block (section reorder)**

In `app/daily/page.tsx`, find the comment `{/* ── Today's Highlight + Micro-commitment ── */}` followed by `<div className="grid md:grid-cols-2 gap-6">`. Cut the entire block (through its matching `</div>`) and paste it immediately after the parsed-tasks block (the block starting with `{parsedTasks.length > 0 && (` and ending with its closing `)}`) and before the `{/* ── Today's scheduled work ── */}` block.

The new JSX section order (top to bottom) is:
1. Date heading
2. Stats row
3. The Gain
4. Today's Forage
5. Fertile Ground
6. Parsed tasks
7. **Sunshine + Sprout grid** ← moved here
8. Today's Work
9. Coming Up

- [ ] **Step 2: Rename the grid wrapper comment**

Replace:
```tsx
      {/* ── Today's Highlight + Micro-commitment ── */}
      <div className="grid md:grid-cols-2 gap-6">
```

With:
```tsx
      {/* ── ☀️ Sunshine + 🌱 Sprout ── */}
      <div className="grid md:grid-cols-2 gap-6">
```

- [ ] **Step 3: Replace the Sunshine section (was Today's Highlight)**

Replace the entire `<div className="space-y-3">` … `</div>` block for Today's Highlight with:

```tsx
        {/* Sunshine */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-yellow-50 dark:bg-[#1c1a0f] p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-[#A16207] dark:text-amber-200">☀️ Sunshine</h2>
            <p className="text-xs text-[#A16207]/80 dark:text-amber-200/70 mt-0.5">The ONE thing that would make today a win.</p>
          </div>
          <Select
            value={log.highlight || ""}
            onValueChange={(v) => saveLog({ highlight: v })}
          >
            <SelectTrigger className="text-sm border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900">
              <SelectValue placeholder="Pick a task as your sunshine…" />
            </SelectTrigger>
            <SelectContent>
              {sortBySprintThenDeadline([...urgentNow, ...todaysTasks]).map((t) => (
                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
              ))}
              {sortBySprintThenDeadline(
                openTasks.filter((t) => !urgentIds.has(t.id) && !todaysTasks.includes(t))
              ).map((t) => (
                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Or type your own sunshine…"
            value={log.highlight}
            onChange={(e) => setLog({ ...log, highlight: e.target.value })}
            onBlur={() => saveLog({ highlight: log.highlight })}
            className="border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900"
          />
          <button
            onClick={() => saveLog({ highlightDone: !log.highlightDone })}
            className="flex items-center gap-2 text-sm"
          >
            {log.highlightDone ? (
              <CheckCircle2 className="h-5 w-5 text-amber-500" />
            ) : (
              <Circle className="h-5 w-5 text-amber-200 dark:text-amber-900" />
            )}
            <span className={log.highlightDone ? "line-through text-amber-400 dark:text-amber-700" : "text-[#A16207] dark:text-amber-200"}>
              {log.highlight || "Set your sunshine above"}
            </span>
          </button>
        </div>
```

- [ ] **Step 4: Replace the Sprout section (was Micro-commitment)**

Replace the entire `<div className="space-y-3">` … `</div>` block for Micro-commitment with:

```tsx
        {/* Sprout */}
        <div className="rounded-xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-[#052e16] p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-green-800 dark:text-green-300">🌱 Sprout</h2>
            <p className="text-xs text-green-800/70 dark:text-green-300/70 mt-0.5">The smallest next action you can start right now.</p>
          </div>
          <Input
            placeholder="e.g. Open the feedback doc"
            value={log.microCommitment}
            onChange={(e) => setLog({ ...log, microCommitment: e.target.value })}
            onBlur={() => saveLog({ microCommitment: log.microCommitment })}
            className="border-green-300 dark:border-green-800 bg-white dark:bg-zinc-900"
          />
          <button
            onClick={() => saveLog({ microDone: !log.microDone })}
            className="flex items-center gap-2 text-sm"
          >
            {log.microDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-green-300 dark:text-green-800" />
            )}
            <span className={log.microDone ? "line-through text-green-400 dark:text-green-700" : "text-green-800 dark:text-green-300"}>
              {log.microCommitment || "Set your sprout above"}
            </span>
          </button>
        </div>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Smoke-test locally**

```bash
npm run dev
```

Open http://localhost:3000/daily. Verify:
- Page background is `#E0EFFE` (light blue)
- Sunshine appears below Fertile Ground — yellow card, ☀️ header, amber text
- Sprout appears beside Sunshine — green card, 🌱 header, green text
- Both appear before Today's Work section
- Toggle dark mode — background becomes `#0D1B2E`, Sunshine card goes dark amber, Sprout goes dark green

- [ ] **Step 7: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: rename Today's Highlight→Sunshine and Micro-commitment→Sprout, move above Today's Work"
```

---

## Part 2: Recurring Tasks

### Task 3: Prisma schema additions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `recurringTaskId` relation to the Task model**

In the `Task` model, add these two lines immediately before the `@@unique([userId, reminderId])` line:

```prisma
  recurringTaskId String?
  recurringTask   RecurringTask? @relation(fields: [recurringTaskId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Add the RecurringTask model**

After the closing `}` of the `DailyLog` model, add:

```prisma
model RecurringTask {
  id                 String    @id @default(cuid())
  userId             String
  name               String
  sprint             Int       @default(1)
  estMinutes         Int       @default(30)
  workCategory       String    @default("STANDARD")
  context            String    @default("PROFESSIONAL")
  recurrenceType     String    // "DAILY" | "WEEKLY" | "MONTHLY"
  recurrenceDays     String    @default("[]")  // JSON int[] — day-of-week (0=Sun…6=Sat), WEEKLY only
  recurrenceMonthDay Int?                       // 1–31, MONTHLY only
  deadlineOffset     Int       @default(0)      // days after scheduledDate → deadline
  active             Boolean   @default(true)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  tasks              Task[]
}
```

- [ ] **Step 3: Push schema and regenerate client**

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

```bash
npx prisma generate && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add RecurringTask model and recurringTaskId to Task"
```

---

### Task 4: Recurring task CRUD API

**Files:**
- Create: `app/api/recurring/route.ts`
- Create: `app/api/recurring/[id]/route.ts`

- [ ] **Step 1: Create `app/api/recurring/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.recurringTask.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name, sprint, estMinutes, workCategory, context,
    recurrenceType, recurrenceDays, recurrenceMonthDay, deadlineOffset,
  } = body;

  if (!name || !recurrenceType) {
    return NextResponse.json({ error: "name and recurrenceType are required" }, { status: 400 });
  }

  const template = await prisma.recurringTask.create({
    data: {
      userId,
      name,
      sprint: Number(sprint) || 1,
      estMinutes: Number(estMinutes) || 30,
      workCategory: workCategory ?? "STANDARD",
      context: context ?? "PROFESSIONAL",
      recurrenceType,
      recurrenceDays: recurrenceDays ?? "[]",
      recurrenceMonthDay: recurrenceMonthDay ? Number(recurrenceMonthDay) : null,
      deadlineOffset: Number(deadlineOffset) || 0,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/recurring/[id]/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await prisma.recurringTask.findUnique({ where: { id } });
  if (!template || template.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name, sprint, estMinutes, workCategory, context,
    recurrenceType, recurrenceDays, recurrenceMonthDay, deadlineOffset, active,
  } = body;

  const updated = await prisma.recurringTask.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(sprint !== undefined && { sprint: Number(sprint) }),
      ...(estMinutes !== undefined && { estMinutes: Number(estMinutes) }),
      ...(workCategory !== undefined && { workCategory }),
      ...(context !== undefined && { context }),
      ...(recurrenceType !== undefined && { recurrenceType }),
      ...(recurrenceDays !== undefined && { recurrenceDays }),
      ...(recurrenceMonthDay !== undefined && {
        recurrenceMonthDay: recurrenceMonthDay ? Number(recurrenceMonthDay) : null,
      }),
      ...(deadlineOffset !== undefined && { deadlineOffset: Number(deadlineOffset) }),
      ...(active !== undefined && { active }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await prisma.recurringTask.findUnique({ where: { id } });
  if (!template || template.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // onDelete: SetNull in schema automatically nullifies recurringTaskId on spawned tasks
  await prisma.recurringTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/recurring/route.ts app/api/recurring/[id]/route.ts
git commit -m "feat: add recurring task CRUD API routes"
```

---

### Task 5: Spawn API route

**Files:**
- Create: `app/api/recurring/spawn/route.ts`

- [ ] **Step 1: Create `app/api/recurring/spawn/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { startOfDay, endOfDay, addDays } from "date-fns";

export async function POST() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const dayOfWeek = today.getDay();    // 0=Sun, 1=Mon, …, 6=Sat
  const dayOfMonth = today.getDate();  // 1–31
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const templates = await prisma.recurringTask.findMany({
    where: { userId, active: true },
  });

  let spawned = 0;

  for (const template of templates) {
    let isRecurrenceDay = false;

    if (template.recurrenceType === "DAILY") {
      isRecurrenceDay = true;
    } else if (template.recurrenceType === "WEEKLY") {
      const days: number[] = JSON.parse(template.recurrenceDays || "[]");
      isRecurrenceDay = days.includes(dayOfWeek);
    } else if (template.recurrenceType === "MONTHLY") {
      const targetDay = template.recurrenceMonthDay ?? 1;
      const effectiveDay = Math.min(targetDay, lastDayOfMonth);
      isRecurrenceDay = dayOfMonth === effectiveDay;
    }

    if (!isRecurrenceDay) continue;

    // Idempotency check — skip if an instance already exists for today
    const existing = await prisma.task.findFirst({
      where: {
        recurringTaskId: template.id,
        scheduledDate: { gte: today, lte: todayEnd },
      },
    });
    if (existing) continue;

    await prisma.task.create({
      data: {
        userId,
        name: template.name,
        sprint: template.sprint,
        estMinutes: template.estMinutes,
        workCategory: template.workCategory,
        context: template.context,
        scheduledDate: today,
        deadline: addDays(today, template.deadlineOffset),
        recurringTaskId: template.id,
      },
    });

    spawned++;
  }

  return NextResponse.json({ spawned });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/recurring/spawn/route.ts
git commit -m "feat: add recurring task spawn route with idempotency check"
```

---

### Task 6: Wire spawn into the daily page

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Await spawn before loading tasks in `loadData`**

In `app/daily/page.tsx`, find the `loadData` callback and replace it with:

```typescript
  const loadData = useCallback(async () => {
    await fetch("/api/recurring/spawn", { method: "POST" });
    const [logRes, tasksRes] = await Promise.all([
      fetch(`/api/daily?date=${todayStr}`),
      fetch(`/api/tasks?context=${mode}`),
    ]);
    const logData = await logRes.json();
    const tasksData = await tasksRes.json();
    if (logData) {
      setLog(logData);
      if (logData.forageOrder) {
        try { setUrgentCustomOrder(JSON.parse(logData.forageOrder)); } catch { /* ignore corrupt data */ }
      }
    }
    setTasks(tasksData);
  }, [todayStr, mode]);
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add app/daily/page.tsx
git commit -m "feat: call recurring spawn on daily page load"
```

---

### Task 7: Recurring section UI in Tasks pane

**Files:**
- Modify: `app/tasks/page.tsx`

- [ ] **Step 1: Add imports**

In `app/tasks/page.tsx`, update the lucide import line to include `RefreshCw`, `Trash2`, `ChevronDown`, `ChevronUp`:

```typescript
import { Plus, CheckCircle2, Circle, X, Pencil, Check, Moon, CalendarClock, Wand2, Star, RefreshCw, Trash2, ChevronDown, ChevronUp } from "lucide-react";
```

- [ ] **Step 2: Add RecurringTask interface**

After the existing `Task` interface, add:

```typescript
type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY";

interface RecurringTask {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  context: string;
  recurrenceType: RecurrenceType;
  recurrenceDays: string;
  recurrenceMonthDay: number | null;
  deadlineOffset: number;
  active: boolean;
}
```

- [ ] **Step 3: Add state declarations**

Inside `TasksPage`, after the existing state declarations, add:

```typescript
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [showRecurringForm, setShowRecurringForm] = useState(false);

  // Recurring form state
  const [rName, setRName] = useState("");
  const [rType, setRType] = useState<RecurrenceType>("WEEKLY");
  const [rDays, setRDays] = useState<number[]>([1]);
  const [rMonthDay, setRMonthDay] = useState(1);
  const [rSprint, setRSprint] = useState("1");
  const [rEst, setREst] = useState("30");
  const [rCategory, setRCategory] = useState("STANDARD");
  const [rContext, setRContext] = useState<Mode>("PROFESSIONAL");
  const [rDeadlineOffset, setRDeadlineOffset] = useState(0);
```

- [ ] **Step 4: Update `load` to spawn and fetch recurring tasks**

Replace the existing `load` callback with:

```typescript
  const load = useCallback(async () => {
    await fetch("/api/recurring/spawn", { method: "POST" });
    const [tasksRes, presetsRes, recurringRes] = await Promise.all([
      fetch(`/api/tasks?context=${mode}`),
      fetch("/api/presets"),
      fetch("/api/recurring"),
    ]);
    setTasks(await tasksRes.json());
    setPresets(await presetsRes.json());
    setRecurringTasks(await recurringRes.json());
  }, [mode]);
```

- [ ] **Step 5: Add helper functions**

After the existing `startEdit` function, add:

```typescript
  function formatPattern(rt: RecurringTask): string {
    if (rt.recurrenceType === "DAILY") return "Every day";
    if (rt.recurrenceType === "MONTHLY") {
      const n = rt.recurrenceMonthDay ?? 1;
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      const suffix = s[(v - 20) % 10] ?? s[v] ?? s[0];
      return `${n}${suffix} of month`;
    }
    const days: number[] = JSON.parse(rt.recurrenceDays || "[]");
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return "Every " + days.map((d) => names[d]).join(", ");
  }

  function resetRecurringForm() {
    setRName(""); setRType("WEEKLY"); setRDays([1]); setRMonthDay(1);
    setRSprint("1"); setREst("30"); setRCategory("STANDARD");
    setRContext("PROFESSIONAL"); setRDeadlineOffset(0);
  }

  function populateRecurringForm(rt: RecurringTask) {
    setRName(rt.name);
    setRType(rt.recurrenceType);
    setRDays(JSON.parse(rt.recurrenceDays || "[]"));
    setRMonthDay(rt.recurrenceMonthDay ?? 1);
    setRSprint(String(rt.sprint));
    setREst(String(rt.estMinutes));
    setRCategory(rt.workCategory);
    setRContext(rt.context as Mode);
    setRDeadlineOffset(rt.deadlineOffset);
  }

  async function saveRecurring() {
    const body = {
      name: rName,
      sprint: rSprint,
      estMinutes: rEst,
      workCategory: rCategory,
      context: rContext,
      recurrenceType: rType,
      recurrenceDays: JSON.stringify(rType === "WEEKLY" ? rDays : []),
      recurrenceMonthDay: rType === "MONTHLY" ? rMonthDay : null,
      deadlineOffset: rDeadlineOffset,
    };
    if (editingRecurringId) {
      await fetch(`/api/recurring/${editingRecurringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditingRecurringId(null);
    } else {
      await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowRecurringForm(false);
    }
    resetRecurringForm();
    load();
  }

  async function toggleRecurringActive(id: string, active: boolean) {
    await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setRecurringTasks((prev) => prev.map((r) => r.id === id ? { ...r, active } : r));
  }

  async function deleteRecurring(id: string) {
    await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    setRecurringTasks((prev) => prev.filter((r) => r.id !== id));
  }
```

- [ ] **Step 6: Add Recurring section JSX**

In the returned JSX, add the following block immediately before the final closing `</div>` of the component:

```tsx
      {/* ── Recurring tasks ── */}
      <div className={`rounded-xl border ${cardCls} overflow-hidden`}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
          onClick={() => setShowRecurring((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
            <span className="font-medium text-sm">Recurring</span>
            {recurringTasks.length > 0 && (
              <span className="text-xs bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 px-2 py-0.5 rounded-full">
                {recurringTasks.filter((r) => r.active).length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetRecurringForm();
                setEditingRecurringId(null);
                setShowRecurring(true);
                setShowRecurringForm((v) => !v);
              }}
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
            {showRecurring
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </button>

        {showRecurring && (
          <div>
            {/* New / Edit form */}
            {(showRecurringForm || editingRecurringId) && (
              <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 space-y-3">
                <Input
                  placeholder="Task name"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
                {/* Recurrence type selector */}
                <div className="flex items-center gap-1 bg-slate-200 dark:bg-zinc-700 rounded-lg p-0.5 w-fit">
                  {(["DAILY", "WEEKLY", "MONTHLY"] as RecurrenceType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRType(t)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        rType === t
                          ? "bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 shadow-sm"
                          : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300"
                      }`}
                    >
                      {t === "DAILY" ? "Daily" : t === "WEEKLY" ? "Weekly" : "Monthly"}
                    </button>
                  ))}
                </div>
                {/* Weekly day picker */}
                {rType === "WEEKLY" && (
                  <div className="flex gap-1">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label, i) => (
                      <button
                        key={i}
                        onClick={() =>
                          setRDays((prev) =>
                            prev.includes(i)
                              ? prev.filter((d) => d !== i)
                              : [...prev, i].sort()
                          )
                        }
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          rDays.includes(i)
                            ? "bg-slate-700 dark:bg-zinc-200 text-white dark:text-zinc-900"
                            : "bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Monthly day picker */}
                {rType === "MONTHLY" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-zinc-400">Day of month:</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={rMonthDay}
                      onChange={(e) => setRMonthDay(Number(e.target.value))}
                      className="h-8 text-xs w-20"
                    />
                  </div>
                )}
                {/* Sprint, est, category, context */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={rSprint} onValueChange={setRSprint}>
                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((s) => (
                        <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={rEst}
                    onChange={(e) => setREst(e.target.value)}
                    className="h-8 text-xs w-24"
                    placeholder="Est. mins"
                  />
                  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700">
                    {(["STANDARD", "GRADING"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setRCategory(cat)}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                          rCategory === cat ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {cat === "STANDARD" ? "☀️ Day" : "🌙 Night"}
                      </button>
                    ))}
                  </div>
                  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700">
                    <button
                      onClick={() => setRContext("PROFESSIONAL")}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${rContext === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      💼 Pro
                    </button>
                    <button
                      onClick={() => setRContext("PERSONAL")}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${rContext === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      🌿 Home
                    </button>
                  </div>
                </div>
                {/* Deadline offset */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-zinc-400">Due:</span>
                  <button
                    onClick={() => setRDeadlineOffset(0)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      rDeadlineOffset === 0
                        ? "border-slate-400 bg-slate-100 dark:bg-zinc-700 dark:border-zinc-500 font-medium"
                        : "border-transparent text-slate-400 hover:border-slate-200"
                    }`}
                  >
                    Same day
                  </button>
                  <span className="text-xs text-slate-400">+</span>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={rDeadlineOffset > 0 ? rDeadlineOffset : ""}
                    onChange={(e) => setRDeadlineOffset(Number(e.target.value))}
                    placeholder="days"
                    className="h-8 text-xs w-20"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRecurringForm(false);
                      setEditingRecurringId(null);
                      resetRecurringForm();
                    }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveRecurring}
                    disabled={!rName.trim() || (rType === "WEEKLY" && rDays.length === 0)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> {editingRecurringId ? "Update" : "Add"}
                  </Button>
                </div>
              </div>
            )}

            {/* Template list */}
            {recurringTasks.length === 0 && !showRecurringForm ? (
              <p className="px-4 py-4 text-sm text-slate-400 dark:text-zinc-500 italic">
                No recurring tasks yet. Click + New to add one.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {recurringTasks.map((rt) => (
                  <div
                    key={rt.id}
                    className={`flex items-center gap-3 px-4 py-2.5 group ${!rt.active ? "opacity-50" : ""}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{rt.name}</span>
                      <span className="ml-2 text-xs text-slate-400 dark:text-zinc-500">
                        {formatPattern(rt)}
                      </span>
                    </div>
                    <SprintBadge sprint={rt.sprint} size="sm" />
                    <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">
                      {formatMinutes(rt.estMinutes)}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-zinc-500 shrink-0">
                      {rt.deadlineOffset === 0 ? "same day" : `+${rt.deadlineOffset}d`}
                    </span>
                    <button
                      onClick={() => toggleRecurringActive(rt.id, !rt.active)}
                      className="shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors border-slate-200 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500"
                      title={rt.active ? "Pause" : "Resume"}
                    >
                      {rt.active ? "active" : "paused"}
                    </button>
                    <button
                      onClick={() => {
                        populateRecurringForm(rt);
                        setEditingRecurringId(rt.id);
                        setShowRecurringForm(false);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteRecurring(rt.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Smoke-test recurring tasks end-to-end**

```bash
npm run dev
```

1. Open http://localhost:3000/tasks — scroll to bottom, "Recurring" section visible, collapsed
2. Click "+ New" — form opens with Daily/Weekly/Monthly toggle
3. Set: name "Check emails", Weekly, Monday (Mo), S3, 15m, Day, Pro, Same day
4. Click Add — template row appears: "Check emails · Every Mon · S3 · 15m · same day · active"
5. Reload the page — if today is Monday, "Check emails" appears in the main task list; reload again — no duplicate
6. Click the "active" badge — changes to "paused"; reload — task does not spawn
7. Click "paused" — resumes; spawns again on next Monday
8. Hover the row — pencil and trash icons appear; click pencil — form pre-fills with template values; edit name, click Update
9. Click trash — template deleted; any previously spawned task remains in main list as a regular task
10. Open http://localhost:3000/daily — recurring tasks also spawn on daily page load

- [ ] **Step 9: Commit**

```bash
git add app/tasks/page.tsx
git commit -m "feat: add recurring tasks section to tasks pane with full CRUD and spawn"
```
