# Task URL Hyperlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `url` field to tasks so links can be attached to any task, surfaced as an `ExternalLink` icon in the UI, auto-extracted by the AI from brain dump text, and editable via every task edit form.

**Architecture:** Add `url String?` to the Prisma `Task` model and propagate it through the API (POST + PATCH), the AI brain dump parser (extract URL from task context, strip from name), and four UI pages (daily, tasks, projects list, project detail). Each page gets `editUrl` state, a URL input in its edit form, and an `ExternalLink` icon in its task display row.

**Tech Stack:** Next.js App Router, Prisma ORM (`prisma db push`), React state, Lucide React (`ExternalLink`, `Link`), Tailwind CSS, `@anthropic-ai/sdk`

---

### Task 1: Add `url` field to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `url` field to Task model**

In `prisma/schema.prisma`, add one line inside the `Task` model after the `syncedFrom` field:

```prisma
  url           String?
```

The Task model block should look like (showing context lines):
```prisma
  syncedFrom      String    @default("app")
  url             String?
  createdAt       DateTime  @default(now())
```

- [ ] **Step 2: Push schema to database**

```bash
npx prisma db push
```

Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add url field to Task model"
```

---

### Task 2: Update task API routes to accept and return `url`

**Files:**
- Modify: `app/api/tasks/route.ts` (POST handler)
- Modify: `app/api/tasks/[id]/route.ts` (PATCH handler)

- [ ] **Step 1: Accept `url` in POST handler**

In `app/api/tasks/route.ts`, update the destructuring and the `prisma.task.create` call:

Change:
```ts
  const { projectId, name, leadDays, deadline, workCategory, sprint, estMinutes, context } = body;
```
To:
```ts
  const { projectId, name, leadDays, deadline, workCategory, sprint, estMinutes, context, url } = body;
```

In the `prisma.task.create` data block, add `url` after `context`:
```ts
      context: context ?? "PROFESSIONAL",
      url: url ?? null,
      ...(body.done ? { done: true, doneAt: new Date() } : {}),
```

- [ ] **Step 2: Accept `url` in PATCH handler**

In `app/api/tasks/[id]/route.ts`, add this block after the existing `if ("reminderId" in body)` line:

```ts
  if ("url" in body) data.url = body.url || null;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `url`.

- [ ] **Step 4: Commit**

```bash
git add app/api/tasks/route.ts app/api/tasks/\[id\]/route.ts
git commit -m "feat: accept url in task POST and PATCH API routes"
```

---

### Task 3: Update AI brain dump parser to extract URLs per task

**Files:**
- Modify: `app/api/ai/parse-braindump/route.ts`

- [ ] **Step 1: Update the system prompt**

In `app/api/ai/parse-braindump/route.ts`, replace the `system:` string. Find this line (the start of the system string):

```ts
      system: `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD", "deadline": "YYYY-MM-DD or null"}].`,
```

Replace the entire system string (it's one long template literal starting at `system:` and ending before the closing backtick before `messages:`). The new value is:

```ts
      system: `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD", "deadline": "YYYY-MM-DD or null", "url": "https://... or null"}]. Sprint rules: S1=urgent/blocking today, S2=deadline-driven, S3=admin/email/MIS/ordering, S4=deep work like lesson planning, feedback writing, resource creation, UDL design. workCategory is "GRADING" for assessment/feedback/report tasks done on work nights, "STANDARD" for everything else. If the brain dump mentions a date, day, or deadline for a task, extract it as an ISO date string (YYYY-MM-DD) relative to today's date (${new Date().toISOString().slice(0, 10)}). If no date is mentioned, set deadline to null. URL EXTRACTION: If a URL (starting with http:// or https://) appears in the brain dump in the context of a task, put it in that task's url field and do NOT include the raw URL in the name field. The name should be clean and readable without any raw URLs. If no URL is associated with a task, set url to null. PRESET MATCHING (be very conservative): Only apply a preset when the task is unambiguously that exact type of professional teaching work — the user must be clearly describing grading student work, writing a rubric, preparing a specific lesson or unit, emailing a parent, submitting to MIS, etc. Do NOT apply presets to personal tasks, hobbies, travel, side projects, or anything that only superficially uses similar words. Examples of what NOT to match: "plan Italy itinerary" is NOT Lesson Planning; "code a game" is NOT Class Materials Prep; "buy supplies" is NOT Ordering. When a preset genuinely applies, name the task "Preset Name: specific detail" (e.g. "Lesson Planning: Unit 3 slides" or "Parent Email: re: missing work Gr 8"). When no preset clearly fits, use the task's literal description and infer sprint/category from context. Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`,
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/parse-braindump/route.ts
git commit -m "feat: extract URL per task in AI brain dump parser"
```

---

### Task 4: Update daily page — ParsedTask, Task interfaces, confirm UI, save

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] **Step 1: Add `url` to the `ParsedTask` interface**

Find the `ParsedTask` interface (around line 67):
```ts
interface ParsedTask {
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  deadline: string; // YYYY-MM-DD, defaults to today
  selected: boolean;
}
```

Replace with:
```ts
interface ParsedTask {
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  deadline: string; // YYYY-MM-DD, defaults to today
  url: string | null;
  selected: boolean;
}
```

- [ ] **Step 2: Add `url` to the `Task` interface**

Find the `Task` interface (around line 44):
```ts
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

Replace with:
```ts
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
  url: string | null;
  project: { id: string; name: string } | null;
}
```

- [ ] **Step 3: Map `url` when setting parsed tasks**

In `parseBrainDump`, find this block (around line 210):
```ts
      setParsedTasks(
        (data.tasks || []).map((t: Omit<ParsedTask, "selected">) => ({
          ...t,
          deadline: t.deadline || todayStr,
          selected: true,
        }))
      );
```

Replace with:
```ts
      setParsedTasks(
        (data.tasks || []).map((t: Omit<ParsedTask, "selected">) => ({
          ...t,
          deadline: t.deadline || todayStr,
          url: t.url ?? null,
          selected: true,
        }))
      );
```

- [ ] **Step 4: Include `url` in `saveSelectedTasks`**

Find the `saveSelectedTasks` function. The `fetch` body JSON is:
```ts
          body: JSON.stringify({ name: t.name, sprint: t.sprint, estMinutes: t.estMinutes, workCategory: t.workCategory ?? "STANDARD", deadline: t.deadline || null, context: mode }),
```

Replace with:
```ts
          body: JSON.stringify({ name: t.name, sprint: t.sprint, estMinutes: t.estMinutes, workCategory: t.workCategory ?? "STANDARD", deadline: t.deadline || null, url: t.url || null, context: mode }),
```

- [ ] **Step 5: Show URL pill in the brain dump confirm UI**

Find the task confirm list (around line 768). The current task name display is:
```tsx
                    <span className="flex-1 text-sm font-medium">{task.name}</span>
```

Replace (within the `<label>` block — the one inside `parsedTasks.map`) with:
```tsx
                    <span className="flex-1 text-sm font-medium">{task.name}</span>
                    {task.url && (
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 shrink-0 max-w-[120px] truncate"
                        title={task.url}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {new URL(task.url).hostname}
                      </a>
                    )}
```

- [ ] **Step 6: Add `ExternalLink` to icon imports**

Find the Lucide import line in `app/daily/page.tsx`. It will look something like:
```ts
import { ... } from "lucide-react";
```

Add `ExternalLink` to that import list.

- [ ] **Step 7: Add ExternalLink icon to task display rows**

There are multiple places task names are rendered in the daily page. Add the URL link in each. Search for occurrences of `{task.name}` inside the task display rows (not in the parsedTasks confirm section — that's already done above).

For the "Today's Forage" urgent task display (around line 485), the name span is:
```tsx
                    {task.name}
```
This appears inside a `<span>`. Locate the `<div className="flex-1 min-w-0">` that wraps this. After the closing `</span>` for the task name, add:
```tsx
                    {task.url && (
                      <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors" title={task.url}>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
```

For "Coming Up" and "Today's Work" sections that also render `{task.name}`, apply the same ExternalLink pattern after each task name span.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: show URL links in daily page tasks and brain dump confirm UI"
```

---

### Task 5: Update tasks page — edit form, display, and interfaces

**Files:**
- Modify: `app/tasks/page.tsx`

- [ ] **Step 1: Add `url` to the `Task` interface**

Find the `Task` interface (around line 44 in tasks/page.tsx). It currently includes fields up to `project`. Add `url` after `context`:

```ts
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
  url: string | null;
  pinned: boolean;
  project: { id: string; name: string } | null;
}
```

Check the exact current interface shape and add `url: string | null;` to it — do not replace fields that may differ.

- [ ] **Step 2: Add `editUrl` state**

Near the other edit state declarations (around line 80), after `const [editContext, setEditContext]`:

```ts
  const [editUrl, setEditUrl] = useState("");
```

- [ ] **Step 3: Populate `editUrl` in `startEdit`**

In the `startEdit` function, add after `setEditContext(...)`:
```ts
    setEditUrl(task.url ?? "");
```

- [ ] **Step 4: Send `url` in `saveEdit`**

In `saveEdit`, add `url` to the fetch body:
```ts
      body: JSON.stringify({
        name: editName,
        sprint: parseInt(editSprint),
        deadline: editDeadline || null,
        scheduledDate: editScheduled || null,
        estMinutes: parseInt(editEst),
        workCategory: editCategory,
        context: editContext,
        url: editUrl.trim() || null,
      }),
```

- [ ] **Step 5: Add URL input to the edit form**

In the edit form JSX (around line 458, after the Est. mins + context toggle row), before the Save/Cancel buttons `<div>`, add:

```tsx
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Link URL</label>
                  <Input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-xs"
                  />
                </div>
```

- [ ] **Step 6: Add ExternalLink icon to task display rows**

Add `ExternalLink` to the Lucide import if not already there.

In the normal task view (around line 510), the task name span is:
```tsx
                  <span className={`text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
```

After this span, inside the `<div className="flex-1 min-w-0">`, add:
```tsx
                  {task.url && (
                    <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors" title={task.url}>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/tasks/page.tsx
git commit -m "feat: add URL edit field and link icon to tasks page"
```

---

### Task 6: Update projects list page — edit form, display, interfaces

**Files:**
- Modify: `app/projects/page.tsx`

- [ ] **Step 1: Add `url` to the `Task` interface**

The `Task` interface in `app/projects/page.tsx` (around line 21):
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
}
```

Replace with:
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
  url: string | null;
}
```

- [ ] **Step 2: Add `editUrl` state**

After the `editLeadDays` state (around line 77):
```ts
  const [editUrl, setEditUrl] = useState("");
```

- [ ] **Step 3: Populate `editUrl` in `startEditTask`**

In `startEditTask` (around line 134), add after `setEditLeadDays(...)`:
```ts
    setEditUrl(task.url ?? "");
```

- [ ] **Step 4: Send `url` in `saveEditTask`**

In `saveEditTask` (around line 145), add `url` to the fetch body:
```ts
      body: JSON.stringify({
        name: editName,
        sprint: parseInt(editSprint),
        deadline: editDeadline || null,
        scheduledDate: editScheduled || null,
        estMinutes: parseInt(editEst),
        workCategory: editCategory,
        leadDays: parseInt(editLeadDays),
        url: editUrl.trim() || null,
      }),
```

- [ ] **Step 5: Add URL input to the edit form**

In the inline edit form (around line 510, after the Est. mins input), before the Save/Cancel buttons `<div>`, add:

```tsx
                            <div className="space-y-1">
                              <label className="text-xs text-slate-500 dark:text-zinc-400">Link URL</label>
                              <Input
                                type="url"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                placeholder="https://..."
                                className="h-8 text-xs"
                              />
                            </div>
```

- [ ] **Step 6: Add ExternalLink to Lucide imports and to task display**

Add `ExternalLink` to the Lucide import line.

In the normal task view (around line 536):
```tsx
                            <span className={`flex-1 text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
```

After this span:
```tsx
                            {task.url && (
                              <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors shrink-0" title={task.url}>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/projects/page.tsx
git commit -m "feat: add URL edit field and link icon to projects list page"
```

---

### Task 7: Update project detail page — edit form, display, interfaces

**Files:**
- Modify: `app/projects/[id]/page.tsx`

- [ ] **Step 1: Add `url` to the `Task` interface**

The `Task` interface in `app/projects/[id]/page.tsx` (around line 21):
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

Replace with:
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
  url: string | null;
}
```

- [ ] **Step 2: Add `editUrl` state**

After `editLeadDays` state (around line 77):
```ts
  const [editUrl, setEditUrl] = useState("");
```

- [ ] **Step 3: Populate `editUrl` in `startEditTask`**

In `startEditTask` (around line 188), add after `setEditLeadDays(...)`:
```ts
    setEditUrl(task.url ?? "");
```

- [ ] **Step 4: Send `url` in `saveEditTask`**

In `saveEditTask` (around line 199), add `url` to the fetch body:
```ts
      body: JSON.stringify({
        name: editName,
        sprint: parseInt(editSprint),
        deadline: editDeadline || null,
        scheduledDate: editScheduled || null,
        estMinutes: parseInt(editEst),
        workCategory: editCategory,
        leadDays: parseInt(editLeadDays),
        url: editUrl.trim() || null,
      }),
```

- [ ] **Step 5: Add URL input to the edit form**

In the inline edit form (around line 428), in the edit form area after the Est. mins input, before the Save/Cancel buttons `<div>`, add:

```tsx
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500 dark:text-zinc-400">Link URL</label>
                          <Input
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            placeholder="https://..."
                            className="h-8 text-xs"
                          />
                        </div>
```

- [ ] **Step 6: Add ExternalLink to Lucide imports and to task display**

Add `ExternalLink` to the Lucide import line.

In the normal task view (around line 504):
```tsx
                            <span className={`flex-1 text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
```

After this span:
```tsx
                            {task.url && (
                              <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors shrink-0" title={task.url}>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "app/projects/[id]/page.tsx"
git commit -m "feat: add URL edit field and link icon to project detail page"
```

---

## Self-Review

**Spec coverage:**
- ✅ `url String?` on Task model — Task 1
- ✅ POST API accepts `url` — Task 2
- ✅ PATCH API accepts `url` — Task 2
- ✅ AI brain dump extracts URL per task, strips from name — Task 3
- ✅ Brain dump confirm UI shows URL pill — Task 4
- ✅ `saveSelectedTasks` sends `url` — Task 4
- ✅ tasks/page.tsx: edit form URL input, ExternalLink display — Task 5
- ✅ projects/page.tsx: edit form URL input, ExternalLink display — Task 6
- ✅ projects/[id]/page.tsx: edit form URL input, ExternalLink display — Task 7
- ✅ All Task interfaces updated to include `url` — Tasks 4–7

**Type consistency:** `url: string | null` used consistently across all interfaces. `editUrl` is a `string` (empty string = no URL). API sends `editUrl.trim() || null` to convert empty string to null.

**Placeholder scan:** No TBDs or TODOs. All code blocks are complete.
