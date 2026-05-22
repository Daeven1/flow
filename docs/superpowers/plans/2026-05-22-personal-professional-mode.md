# Personal / Professional Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Personal/Professional mode toggle to Grove that filters all tasks app-wide by life domain, with a Sunny Garden aesthetic for Personal mode, a renamed/repositioned Fertile Ground section, and persisted Forage drag order.

**Architecture:** A `ModeProvider` React Context wraps the app layout, storing the current mode in `localStorage` with a daily-reset rule (Mon–Fri → Professional, Sat–Sun → Personal). All task-listing API routes accept a `?context=` query param; all task creation calls include the current mode. Pages apply conditional Tailwind classNames based on `useModeContext()`.

**Tech Stack:** Next.js 16 App Router, Prisma ORM, Tailwind CSS v3, shadcn/ui, date-fns v4, `localStorage` for toggle state.

---

## File Map

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `context String @default("PROFESSIONAL")` to Task |
| `app/api/tasks/route.ts` | GET: filter by `?context`; POST: save `context` field |
| `app/api/tasks/[id]/route.ts` | PATCH: accept `context` field |
| `app/api/review/route.ts` | GET: filter done tasks by `?context` |
| `components/ModeProvider.tsx` | **New** — React Context + localStorage daily-reset logic |
| `app/layout.tsx` | Wrap body with `<ModeProvider>`, add flash-prevention inline script |
| `components/Nav.tsx` | Add segmented pill toggle, consume `useModeContext()` |
| `app/globals.css` | Add `.personal-mode body` background override |
| `app/daily/page.tsx` | Forage persistence; Fertile Ground rename/reorder/restyle; mode-aware styling; context in task creation; context switch in Forage edit form |
| `app/tasks/page.tsx` | Context filter on fetch; context in POST; `editContext` state + switch in inline edit |
| `app/sprints/page.tsx` | Context filter on fetch; `editContext` state + switch in inline edit |
| `app/focus/page.tsx` | Context filter on fetch |
| `app/time/page.tsx` | Context filter on fetch |

---

## Task 1: Forage drag order persistence

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Change `urgentCustomOrder` to a lazy-initialised state that seeds from localStorage on first render**

In `app/daily/page.tsx`, replace this line (around line 125):
```tsx
const [urgentCustomOrder, setUrgentCustomOrder] = useState<string[]>([]);
```
With:
```tsx
const [urgentCustomOrder, setUrgentCustomOrder] = useState<string[]>(() => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(`grove-forage-order-${format(startOfDay(new Date()), "yyyy-MM-dd")}`);
  if (stored) { try { return JSON.parse(stored); } catch { /* ignore corrupt data */ } }
  return [];
});
```

- [ ] **Step 2: Persist order on every drag in `handleUrgentDragEnd`**

Replace the existing `handleUrgentDragEnd` function (around line 274):
```tsx
function handleUrgentDragEnd(result: DropResult) {
  if (!result.destination) return;
  setUrgentCustomOrder((prev) => {
    const next = [...prev];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination!.index, 0, moved);
    localStorage.setItem(`grove-forage-order-${todayStr}`, JSON.stringify(next));
    return next;
  });
}
```

- [ ] **Step 3: Verify manually**

Run `npm run dev`, go to `/daily`. If Today's Forage has tasks, drag one, refresh the page — the order should be preserved.

- [ ] **Step 4: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: persist Today's Forage drag order in localStorage"
```

---

## Task 2: Fertile Ground (rename, reorder, restyle)

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Move the Brain Dump section + parsed tasks panel above Today's Work**

In the JSX return (around line 766), the current order is:
1. Today's Work (~line 646)
2. Today's Highlight + Micro (~line 697)
3. Brain Dump (~line 766)
4. Parsed tasks (~line 798)
5. Coming Up (~line 877)

Cut the Brain Dump `<div className="space-y-3">` block (lines ~766–796) and the Parsed tasks block (lines ~798–875) and paste them between Today's Forage and Today's Work sections. The new JSX order inside the `<div className="space-y-6">` wrapper should be:

```
{/* Stats row */}
{/* The Gain */}
{/* Today's Forage */}
{/* ── Fertile Ground ── */}   ← here
{/* Parsed tasks */}            ← here
{/* Today's Work */}
{/* Today's Highlight + Micro */}
{/* Coming Up */}
```

- [ ] **Step 2: Rename heading and subtitle, apply earth-brown styling**

Replace the Brain Dump section wrapper and its contents with:
```tsx
{/* ── Fertile Ground ── */}
<div className="rounded-xl bg-stone-900 p-4 space-y-3">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="font-bold text-sm text-stone-300">🌱 Fertile Ground</h2>
      <p className="text-xs text-stone-500 mt-0.5">
        Drop seeds here. One thought per line or free-write.
      </p>
    </div>
    <Button
      size="sm"
      variant="outline"
      onClick={parseBrainDump}
      disabled={parsing || !log.brainDump.trim()}
      className="border-stone-700 text-stone-300 hover:bg-stone-800 bg-transparent"
    >
      {parsing ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
      )}
      Convert to tasks ↗
    </Button>
  </div>
  <Textarea
    rows={5}
    placeholder="Mark feedback for Year 10, email HOD about field trip, prep Tuesday practical…"
    value={log.brainDump}
    onChange={(e) => setLog({ ...log, brainDump: e.target.value })}
    onBlur={() => saveLog({ brainDump: log.brainDump })}
    className="bg-stone-950 text-stone-200 placeholder:text-stone-600 border-stone-700 resize-none"
  />
</div>
```

- [ ] **Step 3: Verify manually**

Run `npm run dev`, go to `/daily`. Confirm:
- "🌱 Fertile Ground" appears between Today's Forage and Today's Work
- Dark brown section with stone-coloured text
- Textarea is dark with muted placeholder
- "Convert to tasks ↗" button uses stone styling

- [ ] **Step 4: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: rename Brain Dump to Fertile Ground, move above Today's Work, earth-brown styling"
```

---

## Task 3: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: auto-generated migration

- [ ] **Step 1: Add `context` field to the Task model**

In `prisma/schema.prisma`, inside the `model Task { ... }` block, add after the `workCategory` line:
```prisma
context       String    @default("PROFESSIONAL")
```

The Task model block should now include:
```prisma
workCategory  String    @default("STANDARD")
context       String    @default("PROFESSIONAL")
sprint        Int
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_task_context
```

Expected output includes:
```
✔ Generated Prisma Client (v5.x.x)
```

And a new file under `prisma/migrations/`.

- [ ] **Step 3: Verify Prisma client has the new field**

```bash
npx prisma studio
```

Open the Task table — verify the `context` column exists and all rows show `PROFESSIONAL`.

(Press Ctrl+C to exit Studio when done.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add context field to Task model (PROFESSIONAL | PERSONAL)"
```

---

## Task 4: API routes — context filter and save

**Files:**
- Modify: `app/api/tasks/route.ts`
- Modify: `app/api/tasks/[id]/route.ts`
- Modify: `app/api/review/route.ts`

- [ ] **Step 1: Update `GET /api/tasks` to filter by context**

In `app/api/tasks/route.ts`, replace the existing `GET` function:
```ts
export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const context = searchParams.get("context");

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      OR: [{ projectId: null }, { showInRegular: true }],
      ...(context ? { context } : {}),
    },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}
```

- [ ] **Step 2: Update `POST /api/tasks` to save context**

In `app/api/tasks/route.ts`, replace the existing `POST` function:
```ts
export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { projectId, name, leadDays, deadline, workCategory, sprint, estMinutes, context } = body;

  let scheduledDate: Date | null = null;
  if (deadline) {
    const workNightDays = await getWorkNightDays(userId);
    scheduledDate = computeScheduledDate(
      new Date(deadline),
      workCategory ?? "STANDARD",
      Number(estMinutes) || 30,
      workNightDays
    );
  }

  const task = await prisma.task.create({
    data: {
      userId,
      projectId: projectId || null,
      name,
      leadDays: leadDays ?? 0,
      deadline: deadline ? new Date(deadline) : null,
      scheduledDate,
      workCategory: workCategory ?? "STANDARD",
      context: context ?? "PROFESSIONAL",
      sprint: Number(sprint),
      estMinutes: Number(estMinutes) || 30,
      ...(body.done ? { done: true, doneAt: new Date() } : {}),
    },
    include: { project: true },
  });

  return NextResponse.json(task, { status: 201 });
}
```

- [ ] **Step 3: Update `PATCH /api/tasks/[id]` to accept context**

In `app/api/tasks/[id]/route.ts`, add one line in the `data` building block, after the `workCategory` check:
```ts
if ("workCategory" in body) data.workCategory = body.workCategory;
if ("context" in body) data.context = body.context;
```

- [ ] **Step 4: Update `GET /api/review` to filter done tasks by context**

In `app/api/review/route.ts`, replace the `doneTasks` query:
```ts
const context = searchParams.get("context");

const doneTasks = await prisma.task.findMany({
  where: {
    userId,
    done: true,
    doneAt: { gte: weekStart, lte: weekEnd },
    ...(context ? { context } : {}),
  },
});
```

Note: the `searchParams` variable is already destructured at the top of the existing `GET` function.

- [ ] **Step 5: Verify with curl (dev server must be running)**

```bash
# Start dev server first: npm run dev
# Then in another terminal:
curl "http://localhost:3000/api/tasks?context=PROFESSIONAL" \
  -H "Cookie: $(cat /dev/stdin)" 2>/dev/null | head -100
```

(Skip the curl if inconvenient — the page-level tests in later tasks will exercise this.)

- [ ] **Step 6: Commit**

```bash
git add app/api/tasks/route.ts app/api/tasks/[id]/route.ts app/api/review/route.ts
git commit -m "feat: add context filter to tasks GET/POST and review GET API routes"
```

---

## Task 5: ModeProvider component

**Files:**
- Create: `components/ModeProvider.tsx`

- [ ] **Step 1: Create `components/ModeProvider.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { format, startOfDay } from "date-fns";

export type Mode = "PROFESSIONAL" | "PERSONAL";

interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function useModeContext(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useModeContext must be used inside ModeProvider");
  return ctx;
}

function weekdayDefault(): Mode {
  const day = new Date().getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6 ? "PERSONAL" : "PROFESSIONAL";
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");

  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return "PROFESSIONAL";
    const storedDate = localStorage.getItem("grove-mode-date");
    if (storedDate === todayStr) {
      const stored = localStorage.getItem("grove-mode") as Mode | null;
      if (stored === "PROFESSIONAL" || stored === "PERSONAL") return stored;
    }
    return weekdayDefault();
  });

  useEffect(() => {
    document.documentElement.classList.toggle("personal-mode", mode === "PERSONAL");
    localStorage.setItem("grove-mode", mode);
    localStorage.setItem("grove-mode-date", todayStr);
  }, [mode, todayStr]);

  function setMode(m: Mode) {
    setModeState(m);
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ModeProvider.tsx
git commit -m "feat: add ModeProvider context with daily-reset weekday logic"
```

---

## Task 6: Layout — wrap with ModeProvider and flash-prevention script

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Import ModeProvider and wrap the body content**

Replace `app/layout.tsx` with:
```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ModeProvider } from "@/components/ModeProvider";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#1e293b",
};

export const metadata: Metadata = {
  title: "Grove — MYP Design Teacher Productivity",
  description: "ADHD-friendly productivity app for MYP Design teachers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Grove",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icon-180.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('grove-theme');if(m==='dark'||(!m&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Prevent flash of wrong mode on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var today=new Date().toISOString().slice(0,10);var d=localStorage.getItem('grove-mode-date');var m=d===today?localStorage.getItem('grove-mode'):null;if(m==='PERSONAL'||(m===null&&(new Date().getDay()===0||new Date().getDay()===6))){document.documentElement.classList.add('personal-mode')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.className} bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 min-h-screen`}
      >
        <ModeProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        </ModeProvider>
        <Analytics />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors and app still starts**

```bash
npx tsc --noEmit && npm run dev
```

Navigate to `/daily` — app should load without errors. `useModeContext` isn't wired to any UI yet so no visual change.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wrap app layout with ModeProvider, add personal-mode flash-prevention script"
```

---

## Task 7: Nav mode toggle pill

**Files:**
- Modify: `components/Nav.tsx`

- [ ] **Step 1: Import `useModeContext` and add the segmented pill to the Nav JSX**

In `components/Nav.tsx`:

1. Add import at top:
```tsx
import { useModeContext } from "./ModeProvider";
```

2. Inside the `Nav` function body, after the existing `useEffect` hooks, add:
```tsx
const { mode, setMode } = useModeContext();
```

3. In the JSX, between the nav links `<div>` and the right-side controls `<div>`, insert:
```tsx
{/* Mode toggle */}
<div className="bg-slate-800 rounded-full p-0.5 flex gap-0.5 border border-slate-700 shrink-0 mx-2">
  <button
    onClick={() => setMode("PROFESSIONAL")}
    className={cn(
      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
      mode === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
    )}
  >
    💼 Pro
  </button>
  <button
    onClick={() => setMode("PERSONAL")}
    className={cn(
      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
      mode === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"
    )}
  >
    🌿 Home
  </button>
</div>
```

4. Also update the nav background to respond to personal mode — change the `<nav>` element's className:
```tsx
<nav className={cn(
  "flex items-center gap-1 px-4 h-[52px] border-b shrink-0",
  mode === "PERSONAL"
    ? "bg-lime-950 border-lime-900"
    : "bg-slate-900 dark:bg-zinc-900 border-slate-800 dark:border-zinc-800"
)}>
```

5. Update the active nav link chip colour:
```tsx
active
  ? mode === "PERSONAL"
    ? "bg-green-800 text-white"
    : "bg-slate-700 dark:bg-zinc-700 text-white"
  : "text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-zinc-800"
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev`. The nav should show a `💼 Pro / 🌿 Home` pill. Clicking "🌿 Home" should turn the nav bar dark green and highlight the Home segment in green. Clicking "💼 Pro" should restore the dark slate nav.

- [ ] **Step 3: Commit**

```bash
git add components/Nav.tsx
git commit -m "feat: add Personal/Professional mode toggle pill to nav"
```

---

## Task 8: Personal mode CSS — body background

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add `.personal-mode` body background override**

Append to `app/globals.css`:
```css
/* Personal mode (Sunny Garden) overrides */
.personal-mode body {
  background-color: rgb(254 252 232); /* yellow-50 */
}
```

- [ ] **Step 2: Verify in browser**

Run `npm run dev`, switch to Home mode — the page background should shift from light slate to warm cream. Switch back — slate returns.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add personal-mode body background (Sunny Garden cream)"
```

---

## Task 9: Daily page — mode wiring

**Files:**
- Modify: `app/daily/page.tsx`

This task wires mode-awareness into the daily page: context filter on task fetch, context on task creation, context switch in the Forage inline edit, and Sunny Garden styling on key elements.

- [ ] **Step 1: Import `useModeContext` and add mode to the component**

At the top of `app/daily/page.tsx`, add the import:
```tsx
import { useModeContext, type Mode } from "@/components/ModeProvider";
```

Inside `DailyPage()`, after the existing state declarations, add:
```tsx
const { mode } = useModeContext();
```

- [ ] **Step 2: Add `editUrgentContext` state for the Forage inline edit**

Alongside the existing `editUrgentName`, `editUrgentSprint` etc. state vars (around line 127), add:
```tsx
const [editUrgentContext, setEditUrgentContext] = useState<Mode>("PROFESSIONAL");
```

- [ ] **Step 3: Seed `editUrgentContext` when opening the Forage edit form**

In `startEditUrgent`, add:
```tsx
function startEditUrgent(task: Task) {
  setEditingUrgentId(task.id);
  setEditUrgentName(task.name);
  setEditUrgentSprint(String(task.sprint));
  setEditUrgentDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
  setEditUrgentEst(String(task.estMinutes));
  setEditUrgentContext((task.context as Mode) ?? "PROFESSIONAL");
}
```

Note: update the `Task` interface at the top of the file to include `context`:
```tsx
interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
  doneAt: string | null;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  context: string;
  project: { id: string; name: string } | null;
}
```

- [ ] **Step 4: Include `editUrgentContext` in `saveEditUrgent` PATCH**

Replace `saveEditUrgent`:
```tsx
async function saveEditUrgent(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: editUrgentName,
      sprint: parseInt(editUrgentSprint),
      deadline: editUrgentDeadline || null,
      estMinutes: parseInt(editUrgentEst),
      context: editUrgentContext,
    }),
  });
  if (!res.ok) return;
  setEditingUrgentId(null);
  loadData();
}
```

- [ ] **Step 5: Add context switch to the Forage inline edit form**

In the Forage edit form JSX (inside the `editingUrgentId === task.id` branch), after the existing `<div className="flex items-center gap-2">` row with sprint/deadline/est inputs, add a context toggle row:
```tsx
<div className="flex items-center gap-2">
  {/* existing sprint, deadline, est inputs */}
  {/* ... */}
  {/* Context toggle */}
  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700 shrink-0">
    <button
      type="button"
      onClick={() => setEditUrgentContext("PROFESSIONAL")}
      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editUrgentContext === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
    >
      💼 Pro
    </button>
    <button
      type="button"
      onClick={() => setEditUrgentContext("PERSONAL")}
      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editUrgentContext === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}
    >
      🌿 Home
    </button>
  </div>
  <div className="flex gap-2 ml-auto">
    {/* existing Cancel / Save buttons */}
  </div>
</div>
```

- [ ] **Step 6: Pass `?context=${mode}` to the tasks fetch and `context: mode` to all task creation calls**

In `loadData`, update the tasks fetch:
```tsx
fetch(`/api/tasks?context=${mode}`)
```

In `saveSelectedTasks` (Fertile Ground AI parse save), add `context: mode` to the POST body:
```tsx
body: JSON.stringify({
  name: t.name,
  sprint: t.sprint,
  estMinutes: t.estMinutes,
  workCategory: t.workCategory ?? "STANDARD",
  deadline: t.deadline || null,
  context: mode,
}),
```

In `addToGain` (quick-add to The Gain), add `context: mode`:
```tsx
body: JSON.stringify({
  name,
  sprint: 1,
  estMinutes: 30,
  workCategory: "STANDARD",
  done: true,
  context: mode,
}),
```

Note: `loadData` is a `useCallback` with `[todayStr]` as deps — add `mode` to the dep array:
```tsx
const loadData = useCallback(async () => {
  const [logRes, tasksRes] = await Promise.all([
    fetch(`/api/daily?date=${todayStr}`),
    fetch(`/api/tasks?context=${mode}`),
  ]);
  // ...
}, [todayStr, mode]);
```

- [ ] **Step 7: Apply Sunny Garden styling to key page elements**

Define mode-aware class helpers at the top of the component (after `const { mode } = useModeContext()`):
```tsx
const headingCls = mode === "PERSONAL" ? "text-lime-900" : "text-slate-900 dark:text-white";
const mutedCls   = mode === "PERSONAL" ? "text-yellow-700" : "text-zinc-500 dark:text-zinc-400";
const cardCls    = mode === "PERSONAL"
  ? "bg-white border-yellow-200"
  : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800";
```

Apply to the main visible elements:

**Page title** (around line 396):
```tsx
<h1 className={`text-xl font-bold ${headingCls}`}>
```

**Page subtitle**:
```tsx
<p className={`text-xs ${mutedCls} mt-0.5`}>
```

**Stat row cards**: change `bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800` to `${cardCls}` on each card.

**The Gain card**: change its `border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900` to `${cardCls}`.

**Today's Work heading**:
```tsx
<h2 className={`font-bold text-sm ${headingCls}`}>Today&apos;s Work</h2>
```

**Today's Work sprint cards**: change their border/bg to `${cardCls}`.

**Today's Highlight and Micro-commitment headings**: apply `${headingCls}`.

- [ ] **Step 8: Verify in browser**

Run `npm run dev`, go to `/daily`. Toggle between Pro and Home:
- Pro: slate/dark aesthetic, no change from before
- Home: cream background, lime-green headings, yellow card borders
- Fertile Ground stays dark brown in both modes
- Forage tasks correctly change when switching (tasks created in one mode don't appear in the other after refresh)

- [ ] **Step 9: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: wire mode context to daily page — task filtering, creation, edit switch, Sunny Garden styling"
```

---

## Task 10: Tasks page — context filter, creation, edit switch

**Files:**
- Modify: `app/tasks/page.tsx`

- [ ] **Step 1: Import `useModeContext` and add mode**

Add import:
```tsx
import { useModeContext, type Mode } from "@/components/ModeProvider";
```

Inside the page component, add:
```tsx
const { mode } = useModeContext();
```

- [ ] **Step 2: Add `context` to the `Task` interface**

Find the `Task` interface (or type) near the top of the file and add:
```tsx
context: string;
```

- [ ] **Step 3: Pass `?context=${mode}` to the tasks fetch**

Find the `fetch("/api/tasks")` call (around line 66) and update it:
```tsx
fetch(`/api/tasks?context=${mode}`),
```

If it's inside a `useCallback` or `useEffect`, add `mode` to the dependency array.

- [ ] **Step 4: Add `context: mode` to the new-task POST**

Find the `fetch("/api/tasks", { method: "POST", ... })` call (around line 88) and replace its body:
```ts
body: JSON.stringify({
  name: /* existing name field */,
  sprint: /* existing sprint field */,
  estMinutes: /* existing estMinutes field */,
  workCategory: /* existing workCategory field */,
  deadline: /* existing deadline field */,
  context: mode,
}),
```
Keep all existing fields — only add `context: mode`.

- [ ] **Step 5: Add `editContext` state for inline edit**

Alongside the existing edit state vars (around line 56), add:
```tsx
const [editContext, setEditContext] = useState<Mode>("PROFESSIONAL");
```

- [ ] **Step 6: Seed `editContext` in `startEdit`**

In the `startEdit` function, add:
```tsx
setEditContext((task.context as Mode) ?? "PROFESSIONAL");
```

- [ ] **Step 7: Include `context: editContext` in `saveEdit` PATCH**

Find `saveEdit` (around line 138) and add `context: editContext` to the PATCH body alongside `name`, `sprint`, etc.

- [ ] **Step 8: Add context toggle to the inline edit form JSX**

In the inline edit JSX (where sprint/deadline/est controls are rendered), add the same mini pill toggle as in Task 9:
```tsx
<div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700 shrink-0">
  <button
    type="button"
    onClick={() => setEditContext("PROFESSIONAL")}
    className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editContext === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
  >
    💼 Pro
  </button>
  <button
    type="button"
    onClick={() => setEditContext("PERSONAL")}
    className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editContext === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}
  >
    🌿 Home
  </button>
</div>
```

- [ ] **Step 9: Apply Sunny Garden styling to key elements**

After `const { mode } = useModeContext();`, add:
```tsx
const headingCls = mode === "PERSONAL" ? "text-lime-900" : "text-slate-900 dark:text-white";
const mutedCls   = mode === "PERSONAL" ? "text-yellow-700" : "text-zinc-500 dark:text-zinc-400";
const cardCls    = mode === "PERSONAL"
  ? "bg-white border-yellow-200"
  : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800";
```

Apply `headingCls` to the page `<h1>` title, `mutedCls` to subtitle `<p>` elements, and `cardCls` to the task card `<div>` containers that currently have `bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800`.

- [ ] **Step 10: Verify in browser**

Go to `/tasks`. Toggle modes — task list should change. Add a task in Home mode, switch to Pro mode — task should disappear.

- [ ] **Step 11: Commit**

```bash
git add app/tasks/page.tsx
git commit -m "feat: wire context filter and Sunny Garden styling to tasks page"
```

---

## Task 11: Sprints page — context filter and edit switch

**Files:**
- Modify: `app/sprints/page.tsx`

- [ ] **Step 1: Import `useModeContext`, add `mode`, add to `Task` interface**

```tsx
import { useModeContext, type Mode } from "@/components/ModeProvider";
// inside component:
const { mode } = useModeContext();
```

Add `context: string` to the `Task` interface.

- [ ] **Step 2: Pass `?context=${mode}` to the tasks fetch**

Update `fetch("/api/tasks")` (line 53) to `fetch(\`/api/tasks?context=${mode}\`)`. Add `mode` to the dependency array of the surrounding `useCallback`/`useEffect`.

- [ ] **Step 3: Add `editContext` state, seed it, include it in `saveEdit`**

Alongside the existing edit state vars (around line 44), add:
```tsx
const [editContext, setEditContext] = useState<Mode>("PROFESSIONAL");
```

In `startEdit`, add:
```tsx
setEditContext((task.context as Mode) ?? "PROFESSIONAL");
```

In `saveEdit` (around line 88), add `context: editContext` to the PATCH body.

- [ ] **Step 4: Add context toggle to the inline edit form JSX**

In the edit form on the sprints page (where sprint/deadline/est/category controls are), add the same mini pill toggle as in Tasks 9 and 10.

- [ ] **Step 5: Apply Sunny Garden styling to key elements**

After `const { mode } = useModeContext();`, add:
```tsx
const headingCls = mode === "PERSONAL" ? "text-lime-900" : "text-slate-900 dark:text-white";
const mutedCls   = mode === "PERSONAL" ? "text-yellow-700" : "text-zinc-500 dark:text-zinc-400";
const cardCls    = mode === "PERSONAL"
  ? "bg-white border-yellow-200"
  : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800";
```

Apply `headingCls` to the page `<h1>` and sprint-group headings, `mutedCls` to subtitle text, and `cardCls` to sprint-group card containers.

- [ ] **Step 6: Verify in browser**

Go to `/sprints`. Toggle modes — sprint buckets should filter correctly.

- [ ] **Step 7: Commit**

```bash
git add app/sprints/page.tsx
git commit -m "feat: wire context filter and edit switch to sprints page"
```

---

## Task 12: Focus, Time, and Review pages — context filter

**Files:**
- Modify: `app/focus/page.tsx`
- Modify: `app/time/page.tsx`
- Modify: `app/review/page.tsx`

These pages only need the context filter on their task fetch — no new creation forms or edit UI.

- [ ] **Step 1: Focus page — add context filter**

In `app/focus/page.tsx`:

1. Add import: `import { useModeContext } from "@/components/ModeProvider";`
2. Inside the component: `const { mode } = useModeContext();`
3. Update `fetch("/api/tasks")` (line 25) to `fetch(\`/api/tasks?context=${mode}\`)`. Add `mode` to the dep array.

- [ ] **Step 2: Time page — add context filter**

In `app/time/page.tsx`:

1. Add import: `import { useModeContext } from "@/components/ModeProvider";`
2. Inside the component: `const { mode } = useModeContext();`
3. Update `fetch("/api/tasks")` (line 43) to `fetch(\`/api/tasks?context=${mode}\`)`. Add `mode` to the dep array.

- [ ] **Step 3: Review page — add context filter**

In `app/review/page.tsx`:

1. Add import: `import { useModeContext } from "@/components/ModeProvider";`
2. Inside the component: `const { mode } = useModeContext();`
3. Update `fetch("/api/review?weeks=1")` (line 53) to `fetch(\`/api/review?weeks=1&context=${mode}\`)`. Add `mode` to the dep array.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in browser**

Visit `/focus`, `/time`, `/review` — toggle mode in nav, confirm each page re-fetches and shows only the matching tasks.

- [ ] **Step 6: Commit**

```bash
git add app/focus/page.tsx app/time/page.tsx app/review/page.tsx
git commit -m "feat: wire context filter to focus, time, and review pages"
```

---

## Task 13: Final verification and production deploy

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Run the dev build to catch any build-time errors**

```bash
npm run build
```

Expected: build completes, all 33 pages/routes compile.

- [ ] **Step 3: Manual smoke test — Professional mode**

1. Open `/daily` — confirm Today's Work, Forage, Coming Up show only Professional tasks
2. Add a task via Fertile Ground → "Convert to tasks" → tasks save as Professional
3. Drag Forage items, refresh — order persists
4. Open `/tasks` — same filtering
5. Open `/sprints` — same filtering

- [ ] **Step 4: Manual smoke test — Personal mode**

1. Click "🌿 Home" in nav — page background turns cream, nav turns dark green
2. Open `/daily` — shows only Personal tasks (likely empty on first use — that's correct)
3. Add a task via Fertile Ground — it saves as Personal
4. Switch back to Pro — Personal task disappears
5. Switch to Home — Personal task reappears

- [ ] **Step 5: Deploy to production**

```bash
vercel --prod
```

- [ ] **Step 6: Verify production**

Visit the production URL, toggle modes, confirm the feature is live.
