# Student Mode + Rainbow Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Teacher/Student profile mode that swaps presets, templates, and Brain Dump AI prompt; and add a persistent iridescent rainbow flag to Today's Forage task blocks.

**Architecture:** Two independent features sharing one `prisma db push`. Student mode is stored in `UserSettings.userMode`; on switch, a single Prisma transaction replaces presets and default templates. Rainbow flag state is `DailyLog.flaggedForageIds` (JSON string), mirroring the existing `forageOrder` pattern — loaded on mount, saved on every toggle.

**Tech Stack:** Next.js App Router, Prisma ORM, Tailwind CSS v3, Supabase Auth, Anthropic SDK (`claude-sonnet-4-6`)

---

## File Map

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `userMode` to `UserSettings`; add `flaggedForageIds` to `DailyLog` |
| `lib/presetDefaults.ts` | **New** — exports `TEACHER_DEFAULT_PRESETS` and `STUDENT_DEFAULT_PRESETS` |
| `lib/templates.ts` | Add `STUDENT_TEMPLATES` export |
| `app/globals.css` | Add `@keyframes iridescent` + `.forage-flagged` class |
| `app/api/daily/route.ts` | Accept + persist `flaggedForageIds` in POST |
| `app/daily/page.tsx` | Rainbow flag state, toggle handler, `RainbowIcon` component, flagged block class |
| `app/api/presets/route.ts` | Import from `lib/presetDefaults.ts`; make seed + DELETE mode-aware |
| `app/api/templates/route.ts` | Import `STUDENT_TEMPLATES`; make `seedTemplatesIfEmpty` mode-aware |
| `app/api/settings/route.ts` | Return `userMode` in GET; handle mode-switch transaction in POST |
| `app/settings/page.tsx` | Pill toggle with inline confirmation for mode switch |
| `app/api/ai/parse-braindump/route.ts` | Fetch `userMode`; swap system prompt |

---

## Task 1: Schema changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] Open `prisma/schema.prisma`. Find the `UserSettings` model and add `userMode`:

```prisma
model UserSettings {
  id            String @id
  workNightDays String @default("[1]")
  userMode      String @default("TEACHER")
}
```

- [ ] Find the `DailyLog` model and add `flaggedForageIds` after the `forageOrder` field (add only this one line — leave all other fields untouched):

```prisma
  forageOrder      String   @default("")
  flaggedForageIds String   @default("[]")
```

- [ ] Run `prisma db push`:

```bash
npx prisma db push
```

Expected output ends with: `Your database is now in sync with your Prisma schema.`

- [ ] Commit:

```bash
git add prisma/schema.prisma
git commit -m "feat: add userMode to UserSettings and flaggedForageIds to DailyLog"
```

---

## Task 2: Shared preset defaults lib

**Files:**
- Create: `lib/presetDefaults.ts`

This extracts preset arrays from `app/api/presets/route.ts` into a shared lib so `app/api/settings/route.ts` can also import them without duplication.

- [ ] Create `lib/presetDefaults.ts` with this full content:

```ts
export const TEACHER_DEFAULT_PRESETS = [
  { name: "Lesson Planning",                  sprint: 4, estMinutes: 60,  workCategory: "STANDARD", notes: "activities, slides, materials, UDL" },
  { name: "Collaborative Planning",           sprint: 4, estMinutes: 60,  workCategory: "STANDARD", notes: "unit design, resource creation, alignment" },
  { name: "Unit Building",                    sprint: 4, estMinutes: 90,  workCategory: "STANDARD", notes: "task-specific rubrics, concepts, timelines" },
  { name: "Formative Feedback",               sprint: 2, estMinutes: 100, workCategory: "GRADING",  notes: "per class" },
  { name: "Summative Assessment",             sprint: 2, estMinutes: 100, workCategory: "GRADING",  notes: "per class" },
  { name: "Moderation",                       sprint: 2, estMinutes: 60,  workCategory: "GRADING",  notes: "" },
  { name: "Lesson/Tools/Materials Setup",     sprint: 1, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Materials Prep",                   sprint: 3, estMinutes: 30,  workCategory: "STANDARD", notes: "wood, plywood, acrylic, cardboard, robots, etc." },
  { name: "Check Missing Work",               sprint: 1, estMinutes: 10,  workCategory: "STANDARD", notes: "beginning of class" },
  { name: "Advisory Prep",                    sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Parent Email",                     sprint: 3, estMinutes: 10,  workCategory: "STANDARD", notes: "" },
  { name: "Unit Newsletter",                  sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Pre-Unit Reflection",              sprint: 4, estMinutes: 10,  workCategory: "STANDARD", notes: "" },
  { name: "Mid-Unit Reflection",              sprint: 4, estMinutes: 10,  workCategory: "STANDARD", notes: "" },
  { name: "Post-Unit Reflection",             sprint: 4, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Post Assessments",                 sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Student Spotlight / Recognition",  sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "Update Timelines / Planning Docs", sprint: 3, estMinutes: 30,  workCategory: "STANDARD", notes: "" },
  { name: "Write Professional Article / Blog",sprint: 4, estMinutes: 120, workCategory: "STANDARD", notes: "" },
  { name: "Create Instructional Video",       sprint: 4, estMinutes: 90,  workCategory: "STANDARD", notes: "" },
  { name: "Practice/Learn Design Software",   sprint: 4, estMinutes: 60,  workCategory: "STANDARD", notes: "" },
  { name: "Reimbursement Submission",         sprint: 3, estMinutes: 15,  workCategory: "STANDARD", notes: "" },
  { name: "SST Tracking",                     sprint: 3, estMinutes: 20,  workCategory: "STANDARD", notes: "" },
  { name: "Monthly Budget Check-In",          sprint: 3, estMinutes: 20,  workCategory: "STANDARD", notes: "" },
];

export const STUDENT_DEFAULT_PRESETS = [
  { name: "Homework",             sprint: 4, estMinutes: 30, workCategory: "STANDARD", notes: "per subject" },
  { name: "Study / Review",       sprint: 4, estMinutes: 45, workCategory: "STANDARD", notes: "" },
  { name: "Formative Assessment", sprint: 2, estMinutes: 60, workCategory: "GRADING",  notes: "per class" },
  { name: "Summative Assessment", sprint: 2, estMinutes: 90, workCategory: "GRADING",  notes: "per class" },
  { name: "IXL",                  sprint: 3, estMinutes: 20, workCategory: "STANDARD", notes: "" },
  { name: "Form / Return",        sprint: 3, estMinutes: 10, workCategory: "STANDARD", notes: "" },
  { name: "Reading",              sprint: 4, estMinutes: 30, workCategory: "STANDARD", notes: "" },
  { name: "Project Work",         sprint: 4, estMinutes: 60, workCategory: "STANDARD", notes: "" },
];
```

- [ ] Commit:

```bash
git add lib/presetDefaults.ts
git commit -m "feat: extract teacher and student preset defaults to shared lib"
```

---

## Task 3: Student templates

**Files:**
- Modify: `lib/templates.ts`

- [ ] Open `lib/templates.ts`. After the closing `];` of the `TEMPLATES` array, append:

```ts
export const STUDENT_TEMPLATES: Template[] = [
  {
    key: "ia-research",
    label: "IA Research",
    description: "Internal Assessment — research, write-up, and submission",
    tasks: [
      { name: "Define topic and research question",        leadDays: 21, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Write initial literature review",           leadDays: 17, sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Design methodology or experiment",          leadDays: 14, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Collect or gather data",                    leadDays: 10, sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Analyse data and interpret results",        leadDays: 7,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Write discussion and conclusion",           leadDays: 5,  sprint: 4, estMinutes: 60,  workCategory: "GRADING"  },
      { name: "Write full first draft",                    leadDays: 3,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Revise and edit",                           leadDays: 1,  sprint: 2, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Final proofread and submit",                leadDays: 0,  sprint: 1, estMinutes: 30,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "extended-essay",
    label: "Extended Essay",
    description: "4000-word independent research essay for the IB Diploma",
    tasks: [
      { name: "Choose topic and meet supervisor",          leadDays: 30, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Finalise research question",                leadDays: 25, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Conduct research",                          leadDays: 18, sprint: 4, estMinutes: 120, workCategory: "GRADING"  },
      { name: "Write first draft outline",                 leadDays: 14, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Write first full draft",                    leadDays: 10, sprint: 4, estMinutes: 120, workCategory: "GRADING"  },
      { name: "Supervisor review meeting",                 leadDays: 7,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Revise based on feedback",                  leadDays: 4,  sprint: 4, estMinutes: 90,  workCategory: "GRADING"  },
      { name: "Final proofread and format",                leadDays: 1,  sprint: 2, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Submit Extended Essay",                     leadDays: 0,  sprint: 1, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "cas-project",
    label: "CAS Project",
    description: "Creativity, Activity, Service project lifecycle",
    tasks: [
      { name: "Define CAS project theme and goals",        leadDays: 21, sprint: 4, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Plan activities and timeline",              leadDays: 18, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Complete Creativity component",             leadDays: 14, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Complete Activity component",               leadDays: 10, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Complete Service component",                leadDays: 7,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Write CAS reflections",                     leadDays: 3,  sprint: 4, estMinutes: 45,  workCategory: "GRADING"  },
      { name: "Final portfolio review",                    leadDays: 1,  sprint: 3, estMinutes: 30,  workCategory: "STANDARD" },
      { name: "Submit CAS portfolio",                      leadDays: 0,  sprint: 1, estMinutes: 20,  workCategory: "STANDARD" },
    ],
  },
  {
    key: "design-cycle-project",
    label: "Design Cycle Project",
    description: "MYP Design cycle — Inquire, Develop, Create, Evaluate",
    tasks: [
      { name: "Inquire and Analyse — define the problem",  leadDays: 14, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Research existing solutions",               leadDays: 12, sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Develop design brief and specifications",   leadDays: 10, sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Create design ideas and choose direction",  leadDays: 8,  sprint: 4, estMinutes: 60,  workCategory: "STANDARD" },
      { name: "Plan creation process",                     leadDays: 6,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Create the solution",                       leadDays: 4,  sprint: 4, estMinutes: 90,  workCategory: "STANDARD" },
      { name: "Test and evaluate against criteria",        leadDays: 2,  sprint: 4, estMinutes: 45,  workCategory: "STANDARD" },
      { name: "Write final reflection and submit",         leadDays: 0,  sprint: 2, estMinutes: 30,  workCategory: "GRADING"  },
    ],
  },
];
```

- [ ] Commit:

```bash
git add lib/templates.ts
git commit -m "feat: add STUDENT_TEMPLATES to lib/templates.ts"
```

---

## Task 4: Presets API — use shared lib, mode-aware seed and reset

**Files:**
- Modify: `app/api/presets/route.ts`

- [ ] Open `app/api/presets/route.ts`. Replace the inline `DEFAULT_PRESETS` array with an import from the shared lib. At the top of the file, add:

```ts
import { TEACHER_DEFAULT_PRESETS, STUDENT_DEFAULT_PRESETS } from "@/lib/presetDefaults";
```

- [ ] Delete the entire `const DEFAULT_PRESETS = [ ... ];` block (all 24 entries).

- [ ] Replace `seedPresetsIfEmpty` with this mode-aware version:

```ts
async function seedPresetsIfEmpty(userId: string) {
  const count = await prisma.taskPreset.count({ where: { userId } });
  if (count > 0) return;
  const settings = await prisma.userSettings.findUnique({ where: { id: userId } });
  const presets = settings?.userMode === "STUDENT" ? STUDENT_DEFAULT_PRESETS : TEACHER_DEFAULT_PRESETS;
  await prisma.taskPreset.createMany({
    data: presets.map((p, i) => ({ ...p, userId, sortOrder: i })),
  });
}
```

- [ ] Replace the `DELETE` handler with this mode-aware version:

```ts
export async function DELETE() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { id: userId } });
  const presets = settings?.userMode === "STUDENT" ? STUDENT_DEFAULT_PRESETS : TEACHER_DEFAULT_PRESETS;

  await prisma.taskPreset.deleteMany({ where: { userId } });
  await prisma.taskPreset.createMany({
    data: presets.map((p, i) => ({ ...p, userId, sortOrder: i })),
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] Verify the dev server starts cleanly:

```bash
npm run dev
```

Open http://localhost:3000/settings — presets list should load normally. Stop the server.

- [ ] Commit:

```bash
git add app/api/presets/route.ts
git commit -m "feat: make presets API mode-aware using shared preset defaults"
```

---

## Task 5: Templates API — mode-aware seeding

**Files:**
- Modify: `app/api/templates/route.ts`

- [ ] Open `app/api/templates/route.ts`. Update the import line at the top:

```ts
import { TEMPLATES, STUDENT_TEMPLATES } from "@/lib/templates";
```

- [ ] Replace `seedTemplatesIfEmpty` with this mode-aware version:

```ts
async function seedTemplatesIfEmpty(userId: string) {
  const count = await prisma.template.count({ where: { userId } });
  if (count > 0) return;
  const settings = await prisma.userSettings.findUnique({ where: { id: userId } });
  const templates = settings?.userMode === "STUDENT" ? STUDENT_TEMPLATES : TEMPLATES;
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    await prisma.template.create({
      data: {
        userId,
        key: t.key,
        label: t.label,
        description: t.description,
        isCustom: false,
        sortOrder: i,
        tasks: {
          create: t.tasks.map((task, j) => ({
            name: task.name,
            leadDays: task.leadDays,
            sprint: task.sprint,
            estMinutes: task.estMinutes,
            workCategory: task.workCategory,
            sortOrder: j,
          })),
        },
      },
    });
  }
}
```

- [ ] Commit:

```bash
git add app/api/templates/route.ts
git commit -m "feat: make template seeding mode-aware for student vs teacher"
```

---

## Task 6: Settings API — userMode GET/POST + mode-switch transaction

**Files:**
- Modify: `app/api/settings/route.ts`

- [ ] Open `app/api/settings/route.ts`. Add imports at the top, after the existing imports:

```ts
import { TEACHER_DEFAULT_PRESETS, STUDENT_DEFAULT_PRESETS } from "@/lib/presetDefaults";
import { TEMPLATES, STUDENT_TEMPLATES } from "@/lib/templates";
```

- [ ] Replace the entire `GET` handler with this version (adds `userMode` to response):

```ts
export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: "[1]", userMode: "TEACHER" },
    update: {},
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
    userMode: settings.userMode as "TEACHER" | "STUDENT",
  });
}
```

- [ ] Replace the entire `POST` handler with this version (handles mode switch in a transaction):

```ts
export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workNightDays, userMode } = body;

  if (userMode !== undefined) {
    const current = await prisma.userSettings.findUnique({ where: { id: userId } });
    const modeChanged = userMode !== (current?.userMode ?? "TEACHER");

    if (modeChanged) {
      const presets = userMode === "STUDENT" ? STUDENT_DEFAULT_PRESETS : TEACHER_DEFAULT_PRESETS;
      const templates = userMode === "STUDENT" ? STUDENT_TEMPLATES : TEMPLATES;

      await prisma.$transaction(async (tx) => {
        await tx.taskPreset.deleteMany({ where: { userId } });
        await tx.taskPreset.createMany({
          data: presets.map((p, i) => ({ ...p, userId, sortOrder: i })),
        });
        await tx.template.deleteMany({ where: { userId, isCustom: false } });
        for (let i = 0; i < templates.length; i++) {
          const t = templates[i];
          await tx.template.create({
            data: {
              userId,
              key: t.key,
              label: t.label,
              description: t.description,
              isCustom: false,
              sortOrder: i,
              tasks: {
                create: t.tasks.map((task, j) => ({
                  name: task.name,
                  leadDays: task.leadDays,
                  sprint: task.sprint,
                  estMinutes: task.estMinutes,
                  workCategory: task.workCategory,
                  sortOrder: j,
                })),
              },
            },
          });
        }
        await tx.userSettings.upsert({
          where: { id: userId },
          create: { id: userId, workNightDays: "[1]", userMode },
          update: { userMode },
        });
      });

      const updated = await prisma.userSettings.findUnique({ where: { id: userId } });
      return NextResponse.json({
        workNightDays: JSON.parse(updated!.workNightDays) as number[],
        userMode: updated!.userMode as "TEACHER" | "STUDENT",
      });
    }
  }

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: JSON.stringify(workNightDays ?? [1]), userMode: userMode ?? "TEACHER" },
    update: {
      ...(workNightDays !== undefined && { workNightDays: JSON.stringify(workNightDays) }),
    },
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
    userMode: settings.userMode as "TEACHER" | "STUDENT",
  });
}
```

- [ ] Commit:

```bash
git add app/api/settings/route.ts
git commit -m "feat: settings API returns userMode and handles mode-switch transaction"
```

---

## Task 7: Settings UI — pill toggle

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] Open `app/settings/page.tsx`. Add three new state variables after `const [loading, setLoading] = useState(true);`:

```ts
const [userMode, setUserMode] = useState<"TEACHER" | "STUDENT">("TEACHER");
const [modeSwitchTarget, setModeSwitchTarget] = useState<"TEACHER" | "STUDENT" | null>(null);
const [modeSwitching, setModeSwitching] = useState(false);
```

- [ ] In `loadAll`, after `setWorkNightDays(settData.workNightDays ?? [1]);`, add:

```ts
setUserMode(settData.userMode ?? "TEACHER");
```

- [ ] Add the `switchMode` function after `saveSettings`:

```ts
async function switchMode(target: "TEACHER" | "STUDENT") {
  setModeSwitching(true);
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMode: target }),
  });
  setUserMode(target);
  setModeSwitchTarget(null);
  setModeSwitching(false);
  loadAll();
}
```

- [ ] In the JSX, find the opening `<div className="space-y-10 max-w-2xl">` and the `<h1>Settings</h1>`. Insert the Profile Mode section between `<h1>` and the first `{/* ── Work Nights ── */}`:

```tsx
{/* ── Profile Mode ── */}
<section className="space-y-4">
  <div>
    <h2 className="font-medium">Profile Mode</h2>
    <p className="text-xs text-zinc-500 mt-1">
      Sets your default presets, templates, and AI context to match your role.
    </p>
  </div>
  <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 w-fit">
    <button
      onClick={() => userMode !== "TEACHER" && setModeSwitchTarget("TEACHER")}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        userMode === "TEACHER"
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      🏫 Teacher
    </button>
    <button
      onClick={() => userMode !== "STUDENT" && setModeSwitchTarget("STUDENT")}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        userMode === "STUDENT"
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      🎒 Student
    </button>
  </div>
  {modeSwitchTarget && (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-500">
        Switching to {modeSwitchTarget === "STUDENT" ? "Student" : "Teacher"} mode will replace your presets and default templates. Your tasks and projects stay. Continue?
      </span>
      <button
        onClick={() => setModeSwitchTarget(null)}
        className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={() => switchMode(modeSwitchTarget)}
        disabled={modeSwitching}
        className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {modeSwitching ? "Switching…" : "Switch"}
      </button>
    </div>
  )}
</section>

<hr className="border-slate-200 dark:border-zinc-800" />
```

- [ ] Start the dev server and open http://localhost:3000/settings:

```bash
npm run dev
```

Verify:
- Profile Mode section appears at top with `🏫 Teacher` active (indigo-filled)
- Clicking `🎒 Student` shows the inline confirmation row
- Clicking Cancel dismisses it; clicking Switch triggers the spinner then reloads the preset list
- After switching to Student, the presets table shows the 8 student defaults
- After switching back to Teacher, the 24 teacher defaults return
- Refresh the page — the active mode is remembered

- [ ] Stop the server and commit:

```bash
git add app/settings/page.tsx
git commit -m "feat: add profile mode pill toggle to settings page"
```

---

## Task 8: Daily API — flaggedForageIds

**Files:**
- Modify: `app/api/daily/route.ts`

The `GET` handler already returns all DB fields including `flaggedForageIds` (Prisma returns the full record). Only the `POST` upsert needs updating.

- [ ] Open `app/api/daily/route.ts`. In the `POST` handler, update the destructure line:

```ts
const { date, highlight, highlightDone, microCommitment, microDone, brainDump, forageOrder, flaggedForageIds } = body;
```

- [ ] In the `create` object, add `flaggedForageIds` after `forageOrder`:

```ts
forageOrder: forageOrder ?? "",
flaggedForageIds: flaggedForageIds ?? "[]",
```

- [ ] In the `update` object, add the spread after the `forageOrder` line:

```ts
...(flaggedForageIds !== undefined && { flaggedForageIds }),
```

- [ ] Commit:

```bash
git add app/api/daily/route.ts
git commit -m "feat: persist flaggedForageIds in daily log API"
```

---

## Task 9: Rainbow flag CSS

**Files:**
- Modify: `app/globals.css`

- [ ] Open `app/globals.css` and append at the end of the file:

```css
@keyframes iridescent {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.forage-flagged {
  background: linear-gradient(
    270deg,
    rgba(255, 0, 128, 0.08),
    rgba(255, 165, 0, 0.08),
    rgba(255, 255, 0, 0.08),
    rgba(0, 200, 100, 0.08),
    rgba(0, 150, 255, 0.08),
    rgba(130, 80, 255, 0.08),
    rgba(255, 0, 128, 0.08)
  );
  background-size: 400% 400%;
  animation: iridescent 9s ease infinite;
}
```

- [ ] Commit:

```bash
git add app/globals.css
git commit -m "feat: add iridescent keyframe and forage-flagged CSS class"
```

---

## Task 10: Daily page — rainbow flag UI

**Files:**
- Modify: `app/daily/page.tsx`

- [ ] Add `flaggedForageIds` state. Find the block of `useState` declarations (around line 139). After the `urgentCustomOrder` state, add:

```ts
const [flaggedForageIds, setFlaggedForageIds] = useState<string[]>([]);
```

- [ ] In `loadData` (around line 155), after the `forageOrder` block, add:

```ts
if (logData.flaggedForageIds) {
  try { setFlaggedForageIds(JSON.parse(logData.flaggedForageIds)); } catch { /* ignore */ }
}
```

- [ ] Add the toggle handler. Find `async function toggleTask` and add `toggleForageFlag` before it:

```ts
async function toggleForageFlag(taskId: string) {
  const next = flaggedForageIds.includes(taskId)
    ? flaggedForageIds.filter((id) => id !== taskId)
    : [...flaggedForageIds, taskId];
  setFlaggedForageIds(next);
  await fetch("/api/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: todayStr, flaggedForageIds: JSON.stringify(next) }),
  });
}
```

- [ ] Add the `RainbowIcon` component. Place it just before the `export default function DailyPage()` line:

```tsx
function RainbowIcon({ active }: { active: boolean }) {
  const colors = active
    ? ["#FF0080", "#FF8800", "#44CC66", "#4499FF"]
    : ["#888", "#888", "#888", "#888"];
  return (
    <svg width="16" height="10" viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 11 C1 6, 5 1, 10 1 C15 1, 19 6, 19 11"             stroke={colors[0]} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M3.5 11 C3.5 7, 6.5 3.5, 10 3.5 C13.5 3.5, 16.5 7, 16.5 11" stroke={colors[1]} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M6 11 C6 8, 7.8 6, 10 6 C12.2 6, 14 8, 14 11"         stroke={colors[2]} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M8.5 11 C8.5 9.5, 9.1 8.5, 10 8.5 C10.9 8.5, 11.5 9.5, 11.5 11" stroke={colors[3]} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}
```

- [ ] Find the outer `<div>` of each Forage Draggable (around line 572). It currently has `className="bg-white dark:bg-zinc-950"`. Make the class conditional on flagged state:

```tsx
className={flaggedForageIds.includes(task.id) ? "forage-flagged" : "bg-white dark:bg-zinc-950"}
```

(The `style` prop with `borderLeft` stays exactly as it is.)

- [ ] Find the non-editing inner row (around line 640). It ends with the pencil edit button:

```tsx
<button
  onClick={() => startEditUrgent(task)}
  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-300 hover:text-purple-600 transition-colors shrink-0"
>
  <Pencil className="h-3.5 w-3.5" />
</button>
```

Insert the rainbow button **immediately before** that pencil button:

```tsx
<button
  onClick={(e) => { e.stopPropagation(); toggleForageFlag(task.id); }}
  className={`p-1 rounded transition-all shrink-0 ${
    flaggedForageIds.includes(task.id) ? "opacity-100" : "opacity-30 hover:opacity-60"
  }`}
  title="Flag for this sitting"
>
  <RainbowIcon active={flaggedForageIds.includes(task.id)} />
</button>
```

- [ ] Start the dev server and test end-to-end:

```bash
npm run dev
```

Open http://localhost:3000/daily. Verify:
- Each Forage task has a small grey rainbow arc icon to the right of the task name
- Clicking it: arcs turn coloured, block gets a slow iridescent wash (9s cycle)
- Clicking again: reverts to grey and plain white background
- Flag multiple tasks simultaneously — all stay flagged
- Refresh the page — flagged tasks remain flagged (DB persistence confirmed)
- Drag-reorder the Forage list — flagged state follows task IDs correctly

- [ ] Stop the server and commit:

```bash
git add app/daily/page.tsx
git commit -m "feat: add rainbow flag to Today's Forage with iridescent animation"
```

---

## Task 11: Brain Dump AI — mode-aware system prompt

**Files:**
- Modify: `app/api/ai/parse-braindump/route.ts`

- [ ] Open `app/api/ai/parse-braindump/route.ts`. After the `getUser()` check, fetch `userMode` alongside the presets query. Replace:

```ts
const presets = await prisma.taskPreset.findMany({
  where: { userId },
  orderBy: { sortOrder: "asc" },
});
```

With:

```ts
const [presets, settings] = await Promise.all([
  prisma.taskPreset.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
  prisma.userSettings.findUnique({ where: { id: userId } }),
]);
const userMode = settings?.userMode ?? "TEACHER";
```

- [ ] Replace the `system` string passed to `client.messages.create`. It currently starts with `"You are an MYP Design teacher productivity assistant..."`. Replace the entire `system:` value with a conditional:

```ts
system: userMode === "STUDENT"
  ? `You are an IB student productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD", "deadline": "YYYY-MM-DD or null", "url": "https://... or null"}]. Sprint rules: S1=urgent/due today, S2=upcoming assessments, tests, or submission deadlines, S3=admin/forms/emails/IXL, S4=homework, study, project work, reading. workCategory is "GRADING" for major assessments, essays, or assignments done outside school hours, "STANDARD" for everything else. If the brain dump mentions a date, day, or deadline for a task, extract it as an ISO date string (YYYY-MM-DD) relative to today's date (${new Date().toISOString().slice(0, 10)}). If no date is mentioned, set deadline to null. URL EXTRACTION: If a URL (starting with http:// or https://) appears in the context of a task, put it in that task's url field and keep the name clean and readable. If no URL, set url to null. PRESET MATCHING (conservative): Only apply a preset when the task is unambiguously that exact type of schoolwork — the student must be clearly describing homework, a specific assessment, IXL practice, etc. Personal tasks, games, hobbies, and social plans should never match school presets. When a preset applies, name the task "Preset Name: specific detail" (e.g. "Homework: Chapter 5 reading" or "Formative Assessment: Chemistry lab report"). Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`
  : `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD", "deadline": "YYYY-MM-DD or null", "url": "https://... or null"}]. Sprint rules: S1=urgent/blocking today, S2=deadline-driven, S3=admin/email/MIS/ordering, S4=deep work like lesson planning, feedback writing, resource creation, UDL design. workCategory is "GRADING" for assessment/feedback/report tasks done on work nights, "STANDARD" for everything else. If the brain dump mentions a date, day, or deadline for a task, extract it as an ISO date string (YYYY-MM-DD) relative to today's date (${new Date().toISOString().slice(0, 10)}). If no date is mentioned, set deadline to null. URL EXTRACTION: If a URL (starting with http:// or https://) appears in the brain dump in the context of a task, put it in that task's url field and do NOT include the raw URL in the name field. The name should be clean and readable without any raw URLs. If no URL is associated with a task, set url to null. PRESET MATCHING (be very conservative): Only apply a preset when the task is unambiguously that exact type of professional teaching work — the user must be clearly describing grading student work, writing a rubric, preparing a specific lesson or unit, emailing a parent, submitting to MIS, etc. Do NOT apply presets to personal tasks, hobbies, travel, side projects, or anything that only superficially uses similar words. Examples of what NOT to match: "plan Italy itinerary" is NOT Lesson Planning; "code a game" is NOT Class Materials Prep; "buy supplies" is NOT Ordering. When a preset genuinely applies, name the task "Preset Name: specific detail" (e.g. "Lesson Planning: Unit 3 slides" or "Parent Email: re: missing work Gr 8"). When no preset clearly fits, use the task's literal description and infer sprint/category from context. Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`,
```

- [ ] Start the dev server and test:

```bash
npm run dev
```

Switch to Student mode in /settings, go to /daily, type into Fertile Ground: `"chemistry homework chapter 5, IXL math 20 mins, study for bio test Friday"` — click **Convert to tasks**. Verify the parsed tasks use student sprint labels (S4 for homework/study, S3 for IXL) and match student presets where appropriate.

Switch back to Teacher mode, repeat with teacher content — verify teacher behaviour is unchanged.

- [ ] Stop the server and commit:

```bash
git add app/api/ai/parse-braindump/route.ts
git commit -m "feat: swap Brain Dump AI system prompt based on userMode"
```
