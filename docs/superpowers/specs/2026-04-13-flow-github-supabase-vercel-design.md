# Flow — GitHub, Supabase, Vercel & UI Redesign

**Date:** 2026-04-13  
**Status:** Approved

---

## Overview

Flow is an ADHD-friendly productivity app for MYP Design teachers. This spec covers:

1. Publishing the codebase to a private GitHub repository
2. Migrating the database from local SQLite to Supabase PostgreSQL
3. Adding multi-user authentication (Google + GitHub OAuth via Supabase Auth)
4. Scoping all data per-user
5. A full UI redesign (clean light mode + matching dark mode)
6. A new Focus Mode page (sticky note pile)
7. Hosting on Vercel with auto-deploy from GitHub

---

## 1. GitHub

- Create a private GitHub repository for the project
- Before pushing, update `.gitignore` to include:
  - `.env` (contains `DATABASE_URL` and Supabase keys)
  - `prisma/dev.db` (local SQLite database file)
- Push the `main` branch as the initial commit

---

## 2. Database — SQLite → Supabase PostgreSQL

**Approach:** Keep Prisma as the ORM. Swap the datasource provider from `sqlite` to `postgresql`. All existing queries, API routes, and schema models remain unchanged except for the additions described in Section 4.

**Changes:**
- `prisma/schema.prisma` datasource block: `provider = "postgresql"`
- `DATABASE_URL` environment variable points to the Supabase PostgreSQL connection string
- Delete the existing `prisma/migrations` folder (it contains SQLite-specific SQL that won't work on PostgreSQL)
- Run `prisma migrate dev --name init` against Supabase to generate a fresh initial migration from the updated schema
- Remove `better-sqlite3` and `@types/better-sqlite3` from dependencies

---

## 3. Authentication

**Provider:** Supabase Auth with OAuth (Google and GitHub)

**Flow:**
- Unauthenticated visitors are redirected to `/login` by Next.js middleware
- `/login` shows a minimal page with "Sign in with Google" and "Sign in with GitHub" buttons
- After OAuth completes, Supabase sets an HTTP-only session cookie
- Sessions persist indefinitely — users do not need to log in again on subsequent visits
- A sign-out option is accessible from the avatar circle in the top-right of the nav

**Implementation:**
- Install `@supabase/supabase-js` and `@supabase/ssr`
- Create a Supabase client helper for server components, client components, and middleware
- Add `middleware.ts` at the project root to check session validity on every request
- Add `/app/login/page.tsx` with the OAuth button UI
- Configure OAuth callback route at `/app/auth/callback/route.ts`

**Environment variables required:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 4. Data Scoping (Multi-User)

Each user sees and can only modify their own data. Enforcement happens in API routes — every Prisma query includes a `where: { userId }` filter using the authenticated user's Supabase UUID.

**Schema changes — add `userId String` to:**
- `Project`
- `Task` (tasks can exist without a project, so they need direct scoping)
- `DailyLog`
- `WeeklyLog`
- `TaskPreset`
- `Template`

**`UserSettings` change:**
- Current: singleton row with `id: "default"`
- New: `id` becomes the user's Supabase UUID, creating one settings row per user automatically on first access

**Models that do NOT need `userId`** (indirectly scoped):
- `TimeLog` — scoped through `Task`
- `TemplateTask` — scoped through `Template`

---

## 5. UI Redesign

### Design tokens

**Light mode:**
- Background: `#f8fafc` (page), `#ffffff` (cards)
- Nav: `#0f172a`
- Borders: `#e2e8f0`
- Primary text: `#0f172a`
- Muted text: `#94a3b8`
- Primary accent: `#3b82f6`
- Success: `#22c55e`
- Warning: `#f59e0b`

**Dark mode** (Tailwind `dark:` classes, toggled via system preference or manual toggle):
- Background: `#09090b` (page), `#18181b` (cards)
- Nav: `#18181b` with `#27272a` border
- Borders: `#27272a`
- Primary text: `#fafafa`
- Muted text: `#71717a`
- Primary accent: `#6366f1`
- Success: `#4ade80`

### Navigation

Top bar, full-width. Structure:
- Left: `FLOW` wordmark + nav links (Daily, Tasks, Projects, Sprints, Focus, Time, Review, Templates)
- Right: dark/light mode toggle + user avatar circle (initial, opens sign-out menu)
- Active link: white text on `#1e293b` pill background
- Inactive links: `#64748b`

### Page layout pattern

All pages follow:
```
Page header: title (left) + contextual date or action (right)
Stats row (where applicable): 4 metric cards
Content: white cards with `#e2e8f0` border, `10px` border-radius, `20px` padding
```

### Components to update
- `Nav` — full rebuild to match spec
- All Radix UI components (Dialog, Select, Checkbox, etc.) — restyled to match palette
- `SprintBadge`, `UrgencyBadge`, `CapacityBar` — updated colors

---

## 6. Focus Mode (New Page)

**Route:** `/focus`  
**Nav label:** Focus

### Task selection (pre-session)
- Displays all of the user's incomplete tasks with checkboxes
- User checks tasks to add to the pile
- "Start Focus Session" button becomes active once at least one task is selected

### The pile (active session)
- Selected tasks are shown as a stack of yellow sticky notes
- Each note shows: task name, sprint badge, estimated time, and position (e.g. "1 of 5")
- Notes beneath the top are slightly offset and rotated to create a physical stack effect
- A large "Done — next task" button marks the current task complete in the database and triggers the peel animation
- Peel animation: top note slides up and fades out, revealing the note below
- When the last note is completed, a completion state is shown ("All done!")

### Behaviour
- Completing a task in Focus Mode marks it `done: true` and sets `doneAt` in the database — identical to marking it done anywhere else in the app
- If the user leaves and returns mid-session, the pile state is not persisted — they rebuild it each time (intentional: keeps it lightweight)

---

## 7. Vercel Deployment

- Connect Vercel project to the GitHub repository
- Every push to `main` triggers an automatic production deployment
- Set the following environment variables in the Vercel dashboard:
  - `DATABASE_URL` — Supabase PostgreSQL connection string
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ANTHROPIC_API_KEY` — for the existing AI features
- Run `prisma migrate deploy` as part of the build step (add to `package.json` build script or Vercel build command)

---

## Out of Scope

- Email/password authentication
- Row-level security (RLS) in Supabase — enforcement is in API routes
- Persisting Focus Mode session state across page navigations
- Any new features beyond Focus Mode
