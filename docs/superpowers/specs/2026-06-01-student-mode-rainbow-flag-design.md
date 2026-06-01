# Design: Student Mode + Rainbow Flag

**Date:** 2026-06-01  
**Status:** Approved

---

## Overview

Two independent features:

1. **Student Mode** — A user role setting (Teacher / Student) that adjusts task preset defaults, project templates, and the Brain Dump AI prompt to suit an IB student context.
2. **Rainbow Flag** — A per-session focus marker in Today's Forage. Clicking a small rainbow arc icon on a Forage task gives that block a slow iridescent animation, persisted in the daily log.

---

## Feature 1: Student Mode

### Data model

Add one field to `UserSettings` in `prisma/schema.prisma`:

```prisma
model UserSettings {
  id            String @id
  workNightDays String @default("[1]")
  userMode      String @default("TEACHER")   // "TEACHER" | "STUDENT"
}
```

Apply with `prisma db push` (no migration needed, additive column).

### Settings UI

- A **pill toggle** at the top of `app/settings/page.tsx`, above the Work Nights section.
- Two buttons: `🏫 Teacher` and `🎒 Student`. Active mode is indigo-filled, inactive is muted.
- Clicking the inactive pill triggers an **inline confirmation row** (same pattern as "Reset to defaults" and "Delete all tasks"): `"Switching to [Mode] will replace your presets with [mode] defaults. Your tasks and projects stay. Continue?"` with Cancel / Switch buttons.
- On confirm: calls `POST /api/settings` with `{ userMode: "STUDENT" }` (or `"TEACHER"`). The API handles preset replacement in one transaction. Settings page then reloads presets.

### API changes — `/api/settings`

**GET** — add `userMode` to the response alongside `workNightDays`.

**POST** — accept optional `userMode`. When `userMode` changes:
1. Delete all existing presets for the user (`prisma.taskPreset.deleteMany`).
2. Seed the correct defaults for the new mode (see preset lists below).
3. Delete all **default** templates (`template.isCustom === false`) and reseed with the new mode's templates. Custom templates (`isCustom: true`) are left untouched.
4. Save the new `userMode` to `UserSettings`.

All four steps in a single `prisma.$transaction`.

### Preset defaults

**Teacher presets** (existing `DEFAULT_PRESETS` in `/api/presets/route.ts` — unchanged):
Lesson Planning, Collaborative Planning, Unit Building, Formative Feedback, Summative Assessment, Moderation, Lesson/Tools/Materials Setup, Materials Prep, Check Missing Work, Advisory Prep, Parent Email, Unit Newsletter, Pre/Mid/Post-Unit Reflection, Post Assessments, Student Spotlight, Update Timelines/Planning Docs, Write Professional Article/Blog, Create Instructional Video, Practice/Learn Design Software, Reimbursement Submission, SST Tracking, Monthly Budget Check-In.

**Student presets** (new `STUDENT_DEFAULT_PRESETS`):

| Name | Sprint | Est (min) | Category | Notes |
|---|---|---|---|---|
| Homework | S4 | 30 | STANDARD | per subject |
| Study / Review | S4 | 45 | STANDARD | |
| Formative Assessment | S2 | 60 | GRADING | per class |
| Summative Assessment | S2 | 90 | GRADING | per class |
| IXL | S3 | 20 | STANDARD | |
| Form / Return | S3 | 10 | STANDARD | |
| Reading | S4 | 30 | STANDARD | |
| Project Work | S4 | 60 | STANDARD | |

`seedPresetsIfEmpty` must read `userMode` from the DB before deciding which defaults to plant.

### Templates

Add a `STUDENT_TEMPLATES` array to `lib/templates.ts`:

- **IA Research** — Internal Assessment research and write-up project
- **Extended Essay** — EE planning, research, drafting, reflection cycle
- **CAS Project** — Creativity, Activity, Service project lifecycle
- **Design Cycle Project** — Inquiry → Develop → Create → Evaluate

Template tasks follow the same `{ name, leadDays, sprint, estMinutes, workCategory }` shape.

When user is in Student mode, `GET /api/templates` seeds from `STUDENT_TEMPLATES`; when Teacher, from `TEMPLATES`. The seeding check (`templateKey`-based) already exists in the templates route — extend it to be mode-aware.

### AI Brain Dump prompt

In `app/api/ai/parse-braindump/route.ts`, fetch `userMode` from `UserSettings` alongside the presets query. Swap the system prompt prefix based on mode:

- **Teacher (current):** `"You are an MYP Design teacher productivity assistant. Parse this brain dump..."`
- **Student:** `"You are an IB student productivity assistant. Parse this brain dump into JSON... Sprint rules: S1=urgent/due today, S2=upcoming assessments or deadlines, S3=admin/forms/emails/IXL, S4=homework, study, project work, reading. workCategory is 'GRADING' for assessments or major assignments done outside school, 'STANDARD' for everything else..."`

Preset matching guidance in the student prompt: only apply a student preset when the task is unambiguously that type of schoolwork. Personal tasks should never match school presets.

---

## Feature 2: Rainbow Flag (Today's Forage)

### Data model

Add one field to `DailyLog` in `prisma/schema.prisma`:

```prisma
model DailyLog {
  // ... existing fields ...
  flaggedForageIds String @default("[]")   // JSON string[] of task IDs
}
```

Apply with `prisma db push`.

### API changes — `/api/daily`

**GET** — include `flaggedForageIds` in the response (parse JSON before returning, or return raw string and parse client-side — match the pattern used for `forageOrder`).

**PATCH** — accept `flaggedForageIds` (JSON string) and save it, same pattern as `forageOrder`.

### UI — `app/daily/page.tsx`

**State:** `const [flaggedForageIds, setFlaggedForageIds] = useState<string[]>([])`

**Load:** parse `logData.flaggedForageIds` on data load, same as `forageOrder`.

**Toggle handler:**
```ts
function toggleForageFlag(taskId: string) {
  const next = flaggedForageIds.includes(taskId)
    ? flaggedForageIds.filter(id => id !== taskId)
    : [...flaggedForageIds, taskId];
  setFlaggedForageIds(next);
  saveLog({ flaggedForageIds: JSON.stringify(next) });
}
```

**Per-task block:** Inside the non-editing view of each Forage `Draggable`, add a rainbow button as the last item before the pencil edit button. The button is always visible (not group-hover-only — it's a key interaction).

**Rainbow SVG icon:** 4 concentric arcs, 16×10px. Grey (`#888`, opacity 0.35) when inactive, full colour when active:
- Arc 1: `#FF0080`
- Arc 2: `#FF8800`  
- Arc 3: `#44CC66`
- Arc 4: `#4499FF`

**Iridescent block style:** Applied as an inline `style` (or a conditional Tailwind class) when `flaggedForageIds.includes(task.id)`:

```css
background: linear-gradient(270deg, rgba(255,0,128,0.08), rgba(255,165,0,0.08), rgba(255,255,0,0.08), rgba(0,200,100,0.08), rgba(0,150,255,0.08), rgba(130,80,255,0.08), rgba(255,0,128,0.08));
background-size: 400% 400%;
animation: iridescent 9s ease infinite;
```

A `::before` pseudo-element runs the same gradient in reverse at the same 9s speed to deepen the wash. The keyframe (`@keyframes iridescent`) is defined once in `globals.css`.

The left-border sprint colour stripe is preserved — the rainbow wash sits on top of the white background behind it.

---

## Implementation order

1. Schema changes (`prisma db push`) — both fields at once
2. Rainbow flag (self-contained, touches only `app/daily/page.tsx`, `/api/daily`, `globals.css`)
3. Student mode settings UI + API
4. Student presets seeding
5. Student templates
6. AI prompt swap

---

## Out of scope

- Per-subject customisation of student presets
- MYP vs DP distinction within student mode
- Rainbow flag on non-Forage task lists
- Mode-based UI label changes (e.g. renaming "Work Nights" for students)
