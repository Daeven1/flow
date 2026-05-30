# Grove — Claude Code Context

**Obsidian vault note:** `/Users/drempel/Documents/ObsidianVaults/Coding Projects/Coding Projects/Grove Productivity App.md`

## End of session

At the end of every session, update the Obsidian note above:
1. In the **Current Status** section, tick off any tasks completed this session (change `- [ ]` to `- [x]`).
2. Add a new dated entry to the **Work Log** section summarising what was built or changed — two to four bullet points, plain language, no jargon soup.
3. If the overall status changed (e.g. a feature shipped), update the **Status** field in the Repo & Deploy table.

## What this app is

Grove is a personal productivity web app built for **David Rempel**, an MYP Design teacher. It is ADHD-friendly and teacher-specific. It is **not** a general-purpose task manager — every design decision is shaped around the rhythms of a school term: prep periods, work nights, sprint-based prioritisation, and MIS submission deadlines.

Deployed on Vercel. Auth via Supabase. Database is PostgreSQL via Prisma (hosted on Supabase). AI features via Anthropic SDK (user's own API key via env).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router |
| Auth | Supabase SSR (`@supabase/ssr`) |
| Database | PostgreSQL + Prisma ORM |
| AI | `@anthropic-ai/sdk` — `claude-sonnet-4-6` |
| Drag & drop | `@hello-pangea/dnd` |
| Charts | Recharts |
| Styling | Tailwind CSS v3 + shadcn/ui (Radix) |
| Icons | Lucide React |
| Date utils | date-fns v4 |
| Analytics | Vercel Analytics |

All API routes have `export const runtime = 'nodejs'` at the top (required for Prisma on Vercel).

---

## Directory structure

```
app/
  daily/          # Home screen — brain dump, today's tasks, streak
  tasks/          # All tasks list with sprint/filter view
  projects/       # Project list with inline task management
  projects/[id]/  # Project detail — drag-to-reorder tasks, notes
  sprints/        # Sprint capacity and planning view
  focus/          # Focus mode — single task timer
  time/           # Time log history
  review/         # Weekly review + accuracy bars
  templates/      # Template management (TemplateManager component)
  lists/          # Watch list + read list
  settings/       # Work night config, task presets, data reset
  api/
    daily/        # DailyLog CRUD
    tasks/        # Task CRUD + scheduling
    tasks/[id]/   # Task PATCH/DELETE
    projects/     # Project CRUD + template application on create
    projects/[id]/# Project PATCH/DELETE
    templates/    # Template CRUD + seeding defaults
    templates/[id]/
    presets/      # TaskPreset CRUD
    ai/parse-braindump/  # Claude AI: parse free text → task JSON
    settings/     # UserSettings (workNightDays)
    timelogs/     # TimeLog records
    weekly/       # WeeklyLog aggregation
    reminders/    # Reminder sync helpers
    fetch-title/  # URL title scraping (for lists)
    review/       # Review stats endpoint
lib/
  auth.ts         # getUser() — Supabase session helper
  prisma.ts       # Prisma client singleton
  utils.ts        # Shared: sprint colours/labels, urgency, computeScheduledDate, formatMinutes
  templates.ts    # Static default template definitions (seeded to DB on first login)
  workNightDays.ts# Read user's work-night day config
components/
  Nav.tsx         # Top nav bar — links, dark mode toggle, avatar/sign-out
  TemplateManager.tsx  # Full template CRUD UI (used on /templates page)
  SprintBadge.tsx
  UrgencyBadge.tsx
  CapacityBar.tsx
  StickyPile.tsx
  ProjectRow.tsx
```

---

## Data model (Prisma)

```
Task          id, userId, projectId?, name, leadDays, deadline, scheduledDate,
              workCategory (STANDARD|GRADING), sprint (1-4), estMinutes,
              actualMinutes, pinned, showInRegular, sortOrder, done, doneAt,
              reminderId, syncedFrom, timeLogs[]

Project       id, userId, name, deadline?, templateKey?, notes, sortOrder,
              active, tasks[]

Template      id, userId, key, label, description, isCustom, sortOrder, tasks[]
TemplateTask  id, templateId, name, leadDays, sprint, estMinutes, workCategory, sortOrder

TaskPreset    id, userId, name, sprint, estMinutes, workCategory, notes, sortOrder
              (Quick reusable task configs — shown in brain dump and add-task forms)

DailyLog      userId + date (unique), highlight, highlightDone, microCommitment,
              microDone, brainDump

WeeklyLog     userId + weekStart (unique), highlightsDone, microsDone
TimeLog       taskId, taskName, sprint, estMinutes, actualMinutes, date
UserSettings  id (=userId), workNightDays (JSON string, default "[1]" = Monday)
WatchItem     userId, title, genre, rtScore, year, poster, checked
ReadItem      userId, title, genre, avgRating, authors, thumbnail, checked
```

---

## Key domain concepts

**Sprints (not Scrum sprints — a daily urgency filter):**
- S1 Urgent — blocking/due today
- S2 Deadlines — deadline-driven, coming soon
- S3 Admin — email, MIS, ordering
- S4 Deep Work — lesson planning, resource creation, feedback writing

**workCategory:**
- `STANDARD` — done during prep periods (regular school day)
- `GRADING` — done on work nights (e.g. Mondays by default)

**scheduledDate** is computed automatically from deadline + workCategory + estMinutes:
- GRADING: last work-night on or before deadline
- STANDARD: deadline minus buffer (1d for ≤30m, 2d for ≤90m, 3d for >90m), skipping weekends
- Logic lives in `lib/utils.ts:computeScheduledDate`

**leadDays** (project tasks only): days before the project deadline this task is due. 0 = on deadline, 3 = 3 days before.

**Templates** seed on first login from `lib/templates.ts`. Tasks are generated when a project is created with both a `templateKey` AND a `deadline` (logic in `app/api/projects/route.ts` POST).

**Task Presets** are user-defined quick configs (sprint, estMinutes, workCategory) shown in the Brain Dump confirm UI and the add-task form. They are matched by the AI but conservatively — only for unambiguous professional teaching tasks.

---

## Brain Dump AI (`app/api/ai/parse-braindump/route.ts`)

Uses `claude-sonnet-4-6`. Parses free-form text into a JSON array of tasks with sprint, estMinutes, workCategory, deadline, and name.

**Preset matching rule (conservative by design):** only apply a preset label when the task is unambiguously that exact type of professional teaching work. Personal tasks, hobbies, side projects, and travel should never be matched to teaching presets even if words overlap (e.g. "plan Italy trip" ≠ Lesson Planning).

---

## Auth pattern

All API routes call `getUser()` from `lib/auth.ts` which reads the Supabase session. Returns `userId` string or `null`. All DB queries are scoped to `userId`.

---

## Conventions

- `export const runtime = 'nodejs'` required on every API route (Prisma needs Node.js runtime)
- Optimistic UI updates with rollback on error (pattern used in drag-reorder and toggle active)
- No global state library — all state is local React + fetch on change
- Dark mode via `localStorage` key `grove-theme` + `document.documentElement.classList`
- Dates stored as UTC in DB; displayed with `date-fns` using local time
- `sortOrder` fields on Projects and TemplateTask support drag-to-reorder

---

## Supabase Compliance — Public Schema Grant Policy

**Effective May 30, 2026 (new projects) / October 30, 2026 (all projects):** Supabase no longer exposes tables in the `public` schema to the Data API (PostgREST, GraphQL, supabase-js) by default.

**This app is not affected for its data layer.** All database queries go through Prisma ORM over a direct PostgreSQL connection (`DATABASE_URL`), which bypasses the Supabase Data API (PostgREST) entirely. The grant changes are irrelevant to Prisma.

Auth uses Supabase SSR (`@supabase/ssr`), which reads from the `auth` schema — also not affected by the `public` schema change.

**However:** if any future feature ever reads `public` tables via `supabase-js` directly (e.g. a realtime subscription or a browser-side query), those tables would need an explicit grant. For now, no action required.

## Running locally

```bash
npm run dev        # starts Next.js dev server on :3000
```

Requires `.env.local` with:
- `DATABASE_URL` — Supabase PostgreSQL connection string (pooled)
- `DIRECT_URL` — Supabase direct connection (for Prisma migrations)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` — for Brain Dump AI parsing
