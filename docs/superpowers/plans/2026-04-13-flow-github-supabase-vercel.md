# Flow — GitHub, Supabase, Vercel & UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Flow from local SQLite to Supabase PostgreSQL, add Google/GitHub OAuth, scope all data per-user, redesign the UI, add Focus Mode, and deploy to Vercel.

**Architecture:** Prisma stays as the ORM — only the datasource provider changes. Supabase Auth handles OAuth and session cookies via `@supabase/ssr`. All API routes read the user ID from the Supabase session and filter every Prisma query with it. The UI gets a full reskin using Tailwind CSS classes — no new component library.

**Tech Stack:** Next.js 14 App Router, Prisma 5, Supabase Auth (`@supabase/ssr`), Supabase PostgreSQL, Tailwind CSS (dark mode: class), Vercel

---

## File Map

**New files:**
- `lib/supabase/server.ts` — server-side Supabase client (server components + route handlers)
- `lib/supabase/client.ts` — browser-side Supabase client (client components)
- `lib/auth.ts` — `getUser()` helper for route handlers
- `lib/workNightDays.ts` — shared per-user `getWorkNightDays()` helper
- `middleware.ts` — session check + redirect to /login
- `app/login/page.tsx` — OAuth login page
- `app/auth/callback/route.ts` — OAuth callback handler
- `app/focus/page.tsx` — Focus Mode page (task selection + pile)
- `components/StickyPile.tsx` — animated sticky note pile component

**Modified files:**
- `.gitignore` — add `.env`, `prisma/dev.db`
- `prisma/schema.prisma` — provider → postgresql, add userId fields, fix unique constraints
- `package.json` — add `@supabase/supabase-js`, `@supabase/ssr`; remove `better-sqlite3`
- `lib/prisma.ts` — no change needed
- `app/layout.tsx` — add dark-mode persistence script
- `components/Nav.tsx` — full rebuild: dark navy, active pill, avatar with sign-out
- `app/globals.css` — design tokens as CSS custom properties
- `tailwind.config.ts` — add semantic color aliases
- `app/api/settings/route.ts` — userId-scoped
- `app/api/tasks/route.ts` — userId-scoped
- `app/api/tasks/[id]/route.ts` — userId-scoped
- `app/api/projects/route.ts` — userId-scoped
- `app/api/projects/[id]/route.ts` — userId-scoped
- `app/api/daily/route.ts` — userId-scoped
- `app/api/weekly/route.ts` — userId-scoped
- `app/api/timelogs/route.ts` — userId-scoped
- `app/api/presets/route.ts` — userId-scoped
- `app/api/presets/[id]/route.ts` — userId-scoped
- `app/api/templates/route.ts` — userId-scoped
- `app/api/templates/[id]/route.ts` — userId-scoped
- `app/api/review/route.ts` — userId-scoped
- `app/api/ai/parse-braindump/route.ts` — userId-scoped
- All page files in `app/` — updated Tailwind classes for new design

---

## Phase 1: Repo & Infrastructure

### Task 1: Fix .gitignore and push to GitHub

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `.env` and `prisma/dev.db` to .gitignore**

Open `.gitignore` and add these two lines after the existing `# local env files` section:

```
# local env files
.env*.local
.env

# local database
prisma/dev.db

# brainstorming session files
.superpowers/
```

- [ ] **Step 2: Verify `.env` is now ignored**

```bash
git check-ignore -v .env
```

Expected output: `.gitignore:N:.env	.env` (where N is the line number)

- [ ] **Step 3: Create GitHub repository**

Go to github.com → New repository → name `flow` → Private → no README (we already have code) → Create.

- [ ] **Step 4: Add remote and push**

```bash
git remote add origin https://github.com/Daeven1/flow.git
git push -u origin main
```

Expected: repository visible at github.com/Daeven1/flow

---

### Task 2: Create Supabase project

**Files:** none (external setup)

- [ ] **Step 1: Create Supabase project**

Go to supabase.com → New project → name `flow` → choose a region close to you → set a strong database password → Create project. Wait ~2 minutes for provisioning.

- [ ] **Step 2: Get PostgreSQL connection string**

In Supabase dashboard → Settings → Database → Connection string → URI tab. Copy the string. It looks like:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

- [ ] **Step 3: Get Supabase API keys**

Settings → API → copy:
- `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 4: Update local `.env`**

```
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[YOUR_ANON_KEY]"
ANTHROPIC_API_KEY="[your existing key]"
```

---

## Phase 2: Database Migration

### Task 3: Update Prisma schema for PostgreSQL + multi-user

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace the entire `prisma/schema.prisma` with the multi-user PostgreSQL schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id          String    @id @default(cuid())
  userId      String
  name        String
  deadline    DateTime?
  templateKey String?
  createdAt   DateTime  @default(now())
  tasks       Task[]
}

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
  done          Boolean   @default(false)
  doneAt        DateTime?
  createdAt     DateTime  @default(now())
  timeLogs      TimeLog[]
}

model DailyLog {
  id              String   @id @default(cuid())
  userId          String
  date            DateTime
  highlight       String   @default("")
  highlightDone   Boolean  @default(false)
  microCommitment String   @default("")
  microDone       Boolean  @default(false)
  brainDump       String   @default("")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, date])
}

model WeeklyLog {
  id             String   @id @default(cuid())
  userId         String
  weekStart      DateTime
  highlightsDone Int      @default(0)
  microsDone     Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([userId, weekStart])
}

model TimeLog {
  id            String   @id @default(cuid())
  taskId        String
  task          Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskName      String
  sprint        Int
  estMinutes    Int
  actualMinutes Int
  date          DateTime @default(now())
}

model UserSettings {
  id            String @id
  workNightDays String @default("[1]")
}

model TaskPreset {
  id           String   @id @default(cuid())
  userId       String
  name         String
  sprint       Int      @default(4)
  estMinutes   Int      @default(30)
  workCategory String   @default("STANDARD")
  notes        String   @default("")
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
}

model Template {
  id          String         @id @default(cuid())
  userId      String
  key         String
  label       String
  description String         @default("")
  isCustom    Boolean        @default(false)
  sortOrder   Int            @default(0)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  tasks       TemplateTask[]

  @@unique([userId, key])
}

model TemplateTask {
  id           String   @id @default(cuid())
  templateId   String
  template     Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  name         String
  leadDays     Int      @default(0)
  sprint       Int      @default(4)
  estMinutes   Int      @default(30)
  workCategory String   @default("STANDARD")
  sortOrder    Int      @default(0)
}
```

---

### Task 4: Reset migrations and deploy fresh schema to Supabase

**Files:**
- Delete: `prisma/migrations/` (entire folder)
- Modify: `package.json`

- [ ] **Step 1: Remove `better-sqlite3` packages**

```bash
npm uninstall better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Delete the existing SQLite migrations**

```bash
rm -rf prisma/migrations
```

- [ ] **Step 4: Generate the fresh initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: Prisma creates `prisma/migrations/[timestamp]_init/migration.sql` and applies it to your Supabase database. You should see "Your database is now in sync with your schema."

- [ ] **Step 5: Regenerate the Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Verify the tables exist in Supabase**

In Supabase dashboard → Table Editor — you should see: Project, Task, DailyLog, WeeklyLog, TimeLog, UserSettings, TaskPreset, Template, TemplateTask.

- [ ] **Step 7: Commit**

```bash
git add prisma/ package.json package-lock.json
git commit -m "feat: migrate to Supabase PostgreSQL, add userId to all models"
```

---

## Phase 3: Authentication

### Task 5: Create Supabase client helpers and auth utility

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/auth.ts`

- [ ] **Step 1: Create the server-side Supabase client**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies are read-only, ignored
          }
        },
      },
    }
  );
}
```

- [ ] **Step 2: Create the browser-side Supabase client**

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Create the auth helper for route handlers**

Create `lib/auth.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user's ID from the Supabase session.
 * Returns null if no valid session exists.
 * Use in API route handlers only (not server components).
 */
export async function getUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/ lib/auth.ts
git commit -m "feat: add Supabase client helpers and auth utility"
```

---

### Task 6: Add auth middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts` at the project root**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must call getUser() not getSession() for security
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Verify middleware runs**

```bash
npm run dev
```

Open http://localhost:3000 — you should be redirected to `/login` (which will 404 for now). That's correct — it means the middleware is working.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add auth middleware — redirect unauthenticated users to /login"
```

---

### Task 7: Create login page

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Enable OAuth providers in Supabase**

In Supabase dashboard → Authentication → Providers:

**Google:**
- Enable Google provider
- Go to console.cloud.google.com → Create OAuth credentials → Web application
- Add Authorized redirect URI: `https://[PROJECT_REF].supabase.co/auth/v1/callback`
- Copy Client ID and Secret into Supabase Google provider fields → Save

**GitHub:**
- Enable GitHub provider
- Go to github.com → Settings → Developer settings → OAuth Apps → New
- Authorization callback URL: `https://[PROJECT_REF].supabase.co/auth/v1/callback`
- Copy Client ID and Secret into Supabase GitHub provider fields → Save

- [ ] **Step 2: Add the local redirect URL to Supabase**

Supabase → Authentication → URL Configuration:
- Site URL: `http://localhost:3000` (change to your Vercel URL after deploy)
- Add to Redirect URLs: `http://localhost:3000/auth/callback`

- [ ] **Step 3: Create `app/login/page.tsx`**

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { Github } from "lucide-react";

export default function LoginPage() {
  const supabase = createClient();

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function signInWithGitHub() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 w-full max-w-sm shadow-sm">
        <div className="mb-8 text-center">
          <div className="text-xs font-black tracking-[0.2em] text-slate-900 dark:text-white mb-1">
            FLOW
          </div>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            MYP Design Teacher Productivity
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={signInWithGitHub}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify login page loads**

```bash
npm run dev
```

Open http://localhost:3000/login — you should see the FLOW login card with two buttons. No errors in the console.

---

### Task 8: Create OAuth callback route

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Create `app/auth/callback/route.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/daily`);
}
```

- [ ] **Step 2: Test the full login flow**

1. Open http://localhost:3000 — should redirect to `/login`
2. Click "Continue with Google" or "Continue with GitHub"
3. Complete OAuth — should redirect back to `/daily`
4. Refresh the page — should stay on `/daily` (session persists)

- [ ] **Step 3: Commit**

```bash
git add app/login/ app/auth/
git commit -m "feat: add login page and OAuth callback route"
```

---

## Phase 4: Data Scoping

### Task 9: Create shared `getWorkNightDays` helper and update settings route

**Files:**
- Create: `lib/workNightDays.ts`
- Modify: `app/api/settings/route.ts`

- [ ] **Step 1: Create `lib/workNightDays.ts`**

This eliminates the duplicated helper from tasks/route.ts and projects/route.ts.

```typescript
import { prisma } from "@/lib/prisma";

export async function getWorkNightDays(userId: string): Promise<number[]> {
  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: "[1]" },
    update: {},
  });
  try {
    return JSON.parse(settings.workNightDays);
  } catch {
    return [1];
  }
}
```

- [ ] **Step 2: Update `app/api/settings/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: "[1]" },
    update: {},
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
  });
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workNightDays } = body;

  const settings = await prisma.userSettings.upsert({
    where: { id: userId },
    create: { id: userId, workNightDays: JSON.stringify(workNightDays ?? [1]) },
    update: { workNightDays: JSON.stringify(workNightDays ?? [1]) },
  });

  return NextResponse.json({
    workNightDays: JSON.parse(settings.workNightDays) as number[],
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/workNightDays.ts app/api/settings/route.ts
git commit -m "feat: userId-scope settings, extract shared getWorkNightDays helper"
```

---

### Task 10: Update all API routes with userId scoping

**Files:**
- Modify: `app/api/tasks/route.ts`
- Modify: `app/api/tasks/[id]/route.ts`
- Modify: `app/api/projects/route.ts`
- Modify: `app/api/projects/[id]/route.ts`
- Modify: `app/api/daily/route.ts`
- Modify: `app/api/weekly/route.ts`
- Modify: `app/api/timelogs/route.ts`
- Modify: `app/api/presets/route.ts`
- Modify: `app/api/presets/[id]/route.ts`
- Modify: `app/api/templates/route.ts`
- Modify: `app/api/templates/[id]/route.ts`
- Modify: `app/api/review/route.ts`
- Modify: `app/api/ai/parse-braindump/route.ts`

- [ ] **Step 1: Update `app/api/tasks/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { projectId, name, leadDays, deadline, workCategory, sprint, estMinutes } = body;

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
      sprint: Number(sprint),
      estMinutes: Number(estMinutes) || 30,
    },
    include: { project: true },
  });

  return NextResponse.json(task, { status: 201 });
}
```

- [ ] **Step 2: Update `app/api/tasks/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

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

  if ("deadline" in body) {
    data.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.deadline && !("scheduledDate" in body)) {
      const existing = await prisma.task.findUnique({
        where: { id: params.id, userId },
      });
      const workNightDays = await getWorkNightDays(userId);
      data.scheduledDate = computeScheduledDate(
        new Date(body.deadline),
        (body.workCategory ?? existing?.workCategory ?? "STANDARD") as string,
        Number(body.estMinutes ?? existing?.estMinutes ?? 30),
        workNightDays
      );
    } else if (!body.deadline) {
      data.scheduledDate = null;
    }
  }

  if ("scheduledDate" in body) {
    data.scheduledDate = body.scheduledDate ? new Date(body.scheduledDate) : null;
  }

  const task = await prisma.task.update({
    where: { id: params.id, userId },
    data,
    include: { project: true },
  });

  return NextResponse.json(task);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.task.delete({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Update `app/api/projects/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay } from "date-fns";
import { computeScheduledDate } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId },
    include: { tasks: { orderBy: { deadline: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, deadline, templateKey } = body;

  const project = await prisma.project.create({
    data: {
      userId,
      name,
      deadline: deadline ? new Date(deadline) : null,
      templateKey: templateKey || null,
    },
  });

  if (templateKey && deadline) {
    const template = await prisma.template.findUnique({
      where: { userId_key: { userId, key: templateKey } },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });

    if (template) {
      const workNightDays = await getWorkNightDays(userId);
      const deadlineDate = startOfDay(new Date(deadline));

      await prisma.task.createMany({
        data: template.tasks.map((t) => {
          const taskDeadline = addDays(deadlineDate, -t.leadDays);
          const scheduledDate = computeScheduledDate(
            taskDeadline,
            t.workCategory,
            t.estMinutes,
            workNightDays
          );
          return {
            userId,
            projectId: project.id,
            name: t.name,
            leadDays: t.leadDays,
            deadline: taskDeadline,
            scheduledDate,
            workCategory: t.workCategory,
            sprint: t.sprint,
            estMinutes: t.estMinutes,
          };
        }),
      });
    }
  }

  const full = await prisma.project.findUnique({
    where: { id: project.id },
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  return NextResponse.json(full, { status: 201 });
}
```

- [ ] **Step 4: Update `app/api/projects/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.project.delete({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Update `app/api/daily/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date = dateParam ? startOfDay(new Date(dateParam)) : startOfDay(new Date());

  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date } },
  });
  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, highlight, highlightDone, microCommitment, microDone, brainDump } = body;

  const d = startOfDay(new Date(date || new Date()));

  const log = await prisma.dailyLog.upsert({
    where: { userId_date: { userId, date: d } },
    create: {
      userId,
      date: d,
      highlight: highlight ?? "",
      highlightDone: highlightDone ?? false,
      microCommitment: microCommitment ?? "",
      microDone: microDone ?? false,
      brainDump: brainDump ?? "",
    },
    update: {
      ...(highlight !== undefined && { highlight }),
      ...(highlightDone !== undefined && { highlightDone }),
      ...(microCommitment !== undefined && { microCommitment }),
      ...(microDone !== undefined && { microDone }),
      ...(brainDump !== undefined && { brainDump }),
    },
  });

  return NextResponse.json(log);
}
```

- [ ] **Step 6: Update `app/api/weekly/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfWeek } from "date-fns";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("weekStart");
  const weekStart = dateParam
    ? startOfWeek(new Date(dateParam), { weekStartsOn: 1 })
    : startOfWeek(new Date(), { weekStartsOn: 1 });

  const log = await prisma.weeklyLog.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });
  return NextResponse.json(log);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { weekStart, highlightsDone, microsDone } = body;

  const ws = startOfWeek(new Date(weekStart), { weekStartsOn: 1 });

  const log = await prisma.weeklyLog.upsert({
    where: { userId_weekStart: { userId, weekStart: ws } },
    create: {
      userId,
      weekStart: ws,
      highlightsDone: highlightsDone ?? 0,
      microsDone: microsDone ?? 0,
    },
    update: {
      ...(highlightsDone !== undefined && { highlightsDone }),
      ...(microsDone !== undefined && { microsDone }),
    },
  });

  return NextResponse.json(log);
}
```

- [ ] **Step 7: Update `app/api/timelogs/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskId, taskName, sprint, estMinutes, actualMinutes } = body;

  const log = await prisma.timeLog.create({
    data: {
      taskId,
      taskName,
      sprint: Number(sprint),
      estMinutes: Number(estMinutes),
      actualMinutes: Number(actualMinutes),
    },
  });

  await prisma.task.update({
    where: { id: taskId, userId },
    data: { actualMinutes: Number(actualMinutes) },
  });

  return NextResponse.json(log, { status: 201 });
}
```

- [ ] **Step 8: Update `app/api/presets/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const DEFAULT_PRESETS = [
  { name: "Grade Criterion A (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Grade Criterion B (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Grade Criterion C (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Grade Criterion D (per class)", sprint: 2, estMinutes: 60, workCategory: "GRADING", notes: "" },
  { name: "Write parent email", sprint: 3, estMinutes: 10, workCategory: "STANDARD", notes: "" },
  { name: "Lesson setup & materials", sprint: 1, estMinutes: 20, workCategory: "STANDARD", notes: "" },
  { name: "Write report (per student)", sprint: 2, estMinutes: 5, workCategory: "GRADING", notes: "" },
  { name: "MIS data entry", sprint: 3, estMinutes: 15, workCategory: "STANDARD", notes: "" },
  { name: "HOD meeting prep", sprint: 3, estMinutes: 20, workCategory: "STANDARD", notes: "" },
  { name: "Create slide deck (1 lesson)", sprint: 4, estMinutes: 45, workCategory: "STANDARD", notes: "" },
];

async function seedPresetsIfEmpty(userId: string) {
  const count = await prisma.taskPreset.count({ where: { userId } });
  if (count > 0) return;
  await prisma.taskPreset.createMany({
    data: DEFAULT_PRESETS.map((p, i) => ({ ...p, userId, sortOrder: i })),
  });
}

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await seedPresetsIfEmpty(userId);
  const presets = await prisma.taskPreset.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(presets);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const count = await prisma.taskPreset.count({ where: { userId } });
  const preset = await prisma.taskPreset.create({
    data: {
      userId,
      name: body.name,
      sprint: Number(body.sprint) ?? 4,
      estMinutes: Number(body.estMinutes) ?? 30,
      workCategory: body.workCategory ?? "STANDARD",
      notes: body.notes ?? "",
      sortOrder: count,
    },
  });
  return NextResponse.json(preset, { status: 201 });
}
```

- [ ] **Step 9: Update `app/api/presets/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("sprint" in body) data.sprint = Number(body.sprint);
  if ("estMinutes" in body) data.estMinutes = Number(body.estMinutes);
  if ("workCategory" in body) data.workCategory = body.workCategory;
  if ("notes" in body) data.notes = body.notes;

  const preset = await prisma.taskPreset.update({
    where: { id: params.id, userId },
    data,
  });
  return NextResponse.json(preset);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.taskPreset.delete({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 10: Update `app/api/templates/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TEMPLATES } from "@/lib/templates";
import { getUser } from "@/lib/auth";

async function seedTemplatesIfEmpty(userId: string) {
  const count = await prisma.template.count({ where: { userId } });
  if (count > 0) return;

  for (let i = 0; i < TEMPLATES.length; i++) {
    const t = TEMPLATES[i];
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

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await seedTemplatesIfEmpty(userId);
  const templates = await prisma.template.findMany({
    where: { userId },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { label, description, tasks } = body;

  const count = await prisma.template.count({ where: { userId } });
  const key = `custom-${Date.now()}`;

  const template = await prisma.template.create({
    data: {
      userId,
      key,
      label,
      description: description ?? "",
      isCustom: true,
      sortOrder: count,
      tasks: {
        create: (tasks ?? []).map(
          (
            task: {
              name: string;
              leadDays: number;
              sprint: number;
              estMinutes: number;
              workCategory: string;
            },
            j: number
          ) => ({
            name: task.name,
            leadDays: task.leadDays ?? 0,
            sprint: task.sprint ?? 4,
            estMinutes: task.estMinutes ?? 30,
            workCategory: task.workCategory ?? "STANDARD",
            sortOrder: j,
          })
        ),
      },
    },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(template, { status: 201 });
}
```

- [ ] **Step 11: Update `app/api/templates/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { label, description, tasks } = body;

  const data: Record<string, unknown> = {};
  if ("label" in body) data.label = label;
  if ("description" in body) data.description = description;

  if (Array.isArray(tasks)) {
    await prisma.templateTask.deleteMany({ where: { templateId: params.id } });
    await prisma.templateTask.createMany({
      data: tasks.map(
        (
          task: {
            name: string;
            leadDays: number;
            sprint: number;
            estMinutes: number;
            workCategory: string;
          },
          j: number
        ) => ({
          templateId: params.id,
          name: task.name,
          leadDays: task.leadDays ?? 0,
          sprint: task.sprint ?? 4,
          estMinutes: task.estMinutes ?? 30,
          workCategory: task.workCategory ?? "STANDARD",
          sortOrder: j,
        })
      ),
    });
  }

  const updated = await prisma.template.update({
    where: { id: params.id, userId },
    data,
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.template.delete({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 12: Update `app/api/review/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { getUser } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weeksBack = parseInt(searchParams.get("weeks") || "1");

  const now = new Date();
  const weekStart = startOfWeek(subWeeks(now, weeksBack - 1), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const doneTasks = await prisma.task.findMany({
    where: {
      userId,
      done: true,
      doneAt: { gte: weekStart, lte: weekEnd },
    },
  });

  // TimeLogs are scoped through their parent Task
  const timeLogs = await prisma.timeLog.findMany({
    where: {
      task: { userId },
      date: { gte: weekStart, lte: weekEnd },
    },
  });

  const sprintBreakdown = [1, 2, 3, 4].map((s) => {
    const logs = timeLogs.filter((l) => l.sprint === s);
    const actual = logs.reduce((sum, l) => sum + l.actualMinutes, 0);
    const est = logs.reduce((sum, l) => sum + l.estMinutes, 0);
    return { sprint: s, actual, est, count: logs.length };
  });

  const totalActual = timeLogs.reduce((sum, l) => sum + l.actualMinutes, 0);
  const s1Actual = timeLogs
    .filter((l) => l.sprint === 1)
    .reduce((sum, l) => sum + l.actualMinutes, 0);
  const urgentPct = totalActual > 0 ? Math.round((s1Actual / totalActual) * 100) : 0;

  const dailyLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gte: weekStart, lte: weekEnd } },
    orderBy: { date: "asc" },
  });

  const weeklyLog = await prisma.weeklyLog.findFirst({
    where: { userId, weekStart: { gte: weekStart } },
  });

  return NextResponse.json({
    doneTasks: doneTasks.length,
    totalEstMinutes: timeLogs.reduce((s, l) => s + l.estMinutes, 0),
    totalActualMinutes: totalActual,
    sprintBreakdown,
    urgentPct,
    nudge:
      urgentPct > 60
        ? `${urgentPct}% of your time went to urgent tasks. Try protecting time for deep work next week.`
        : null,
    dailyLogs,
    weeklyLog,
  });
}
```

- [ ] **Step 13: Update `app/api/ai/parse-braindump/route.ts`**

```typescript
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const client = new Anthropic();

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await req.json();

  if (!text?.trim()) {
    return NextResponse.json({ tasks: [] });
  }

  const presets = await prisma.taskPreset.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  const presetsContext =
    presets.length > 0
      ? `\n\nUser's personal task timing presets (use these for matching task types):\n${presets
          .map(
            (p) =>
              `- "${p.name}": sprint ${p.sprint}, ${p.estMinutes} mins, ${
                p.workCategory === "GRADING" ? "work night" : "prep period"
              }`
          )
          .join("\n")}`
      : "";

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        `You are an MYP Design teacher productivity assistant. Parse this brain dump into JSON: [{"name": "task name", "sprint": 1, "estMinutes": 30, "workCategory": "STANDARD"}]. Sprint rules: S1=urgent/blocking today, S2=deadline-driven, S3=admin/email/MIS/ordering, S4=deep work like lesson planning, feedback writing, resource creation, UDL design. workCategory is "GRADING" for assessment/feedback/report tasks done on work nights, "STANDARD" for everything else. If a task matches a preset name or type closely, use that preset's sprint, estMinutes, and workCategory. Return ONLY valid JSON array, no markdown or explanation.${presetsContext}`,
      messages: [{ role: "user", content: text }],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "[]";

    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      tasks = match ? JSON.parse(match[0]) : [];
    }

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("AI parse error:", error);
    return NextResponse.json(
      { tasks: [], error: "AI parsing failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 14: Verify all routes compile**

```bash
npm run build
```

Expected: Build succeeds with no type errors. Fix any TypeScript errors before continuing.

- [ ] **Step 15: Smoke-test data scoping**

1. `npm run dev`
2. Log in as User A (Google/GitHub)
3. Create a task — verify it saves and appears in the tasks list
4. Log in as User B (a different Google/GitHub account in an incognito window)
5. Verify User B sees no tasks from User A

- [ ] **Step 16: Commit**

```bash
git add app/api/ lib/
git commit -m "feat: scope all API routes to authenticated user"
```

---

## Phase 5: UI Redesign

### Task 11: Update design tokens

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Update `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    box-sizing: border-box;
  }

  html {
    -webkit-font-smoothing: antialiased;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 3px;
  }
  .dark ::-webkit-scrollbar-thumb {
    background: #27272a;
  }
}
```

- [ ] **Step 2: Update `tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode surface
        surface: {
          DEFAULT: "#ffffff",
          page: "#f8fafc",
          nav: "#0f172a",
          "nav-active": "#1e293b",
        },
        // Borders
        border: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1",
        },
        // Muted text
        muted: {
          DEFAULT: "#94a3b8",
          strong: "#64748b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Update `app/layout.tsx` to persist dark mode**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FLOW — MYP Design Teacher Productivity",
  description: "ADHD-friendly productivity app for MYP Design teachers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevents flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('flow-theme');if(m==='dark'||(!m&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.className} bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 min-h-screen`}
      >
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/globals.css tailwind.config.ts app/layout.tsx
git commit -m "feat: update design tokens and dark mode persistence"
```

---

### Task 12: Rebuild Nav component

**Files:**
- Modify: `components/Nav.tsx`

- [ ] **Step 1: Replace `components/Nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarDays,
  FolderKanban,
  CheckSquare,
  Layers,
  Clock,
  BarChart2,
  Settings,
  LayoutTemplate,
  Crosshair,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/sprints", label: "Sprints", icon: Layers },
  { href: "/focus", label: "Focus", icon: Crosshair },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/review", label: "Review", icon: BarChart2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [userInitial, setUserInitial] = useState<string>("?");
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isDark =
      localStorage.getItem("flow-theme") === "dark" ||
      (!localStorage.getItem("flow-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserInitial(user.email[0].toUpperCase());
      else if (user?.user_metadata?.name)
        setUserInitial(user.user_metadata.name[0].toUpperCase());
    });
  }, []);

  // Close avatar menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("flow-theme", next ? "dark" : "light");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="flex items-center gap-1 px-4 h-[52px] bg-slate-900 dark:bg-zinc-900 border-b border-slate-800 dark:border-zinc-800 overflow-x-auto shrink-0">
      {/* Brand */}
      <span className="text-xs font-black tracking-[0.2em] text-white mr-5 shrink-0">
        FLOW
      </span>

      {/* Nav links */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                active
                  ? "bg-slate-700 dark:bg-zinc-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <button
          onClick={toggleDark}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-zinc-800 transition-colors"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Avatar + sign-out dropdown */}
        <div className="relative" ref={avatarRef}>
          <button
            onClick={() => setAvatarOpen((o) => !o)}
            className="w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-400 flex items-center justify-center text-xs font-bold text-white transition-colors"
          >
            {userInitial}
          </button>

          {avatarOpen && (
            <div className="absolute right-0 top-9 w-40 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 z-50">
              <Link
                href="/settings"
                onClick={() => setAvatarOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 w-full text-left"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify nav renders correctly**

```bash
npm run dev
```

Check http://localhost:3000/daily — nav should be dark navy with all links, a moon/sun toggle, and an avatar circle. Clicking the avatar should show a settings + sign out dropdown.

- [ ] **Step 3: Commit**

```bash
git add components/Nav.tsx
git commit -m "feat: rebuild Nav with dark navy design, avatar dropdown, sign-out"
```

---

### Task 13: Apply new design to all pages

**Files:**
- Modify: all page files in `app/daily/`, `app/tasks/`, `app/projects/`, `app/sprints/`, `app/time/`, `app/review/`, `app/settings/`, `app/templates/`

The goal is to apply the design system consistently. For each page, follow this pattern:

**Page wrapper:**
```tsx
<div className="space-y-6">
  {/* Page header */}
  <div className="flex items-center justify-between">
    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Page Title</h1>
    {/* Optional: date, actions */}
  </div>

  {/* Stats row (where applicable) — 4 cards */}
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
      <div className="text-2xl font-bold text-slate-900 dark:text-white">42</div>
      <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Label</div>
    </div>
  </div>

  {/* Content cards */}
  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
    {/* card content */}
  </div>
</div>
```

**Card section label:**
```tsx
<div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-3">
  Section Label
</div>
```

**Buttons:**
```tsx
{/* Primary */}
<button className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors">
  Action
</button>

{/* Secondary */}
<button className="px-3 py-1.5 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
  Action
</button>
```

**Input fields:**
```tsx
<input className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
```

- [ ] **Step 1: Apply design to `app/daily/page.tsx`**

Read the current daily page, then update all Tailwind classes to match the pattern above. Add the 4-card stats row at the top (tasks this sprint, done today, time logged, sprint progress — reading from the same API endpoints the page already uses). Change `bg-white dark:bg-zinc-950` → `bg-white dark:bg-zinc-900`, update borders from `zinc-*` to `slate-200/zinc-800`, update text from `zinc-*` to `slate-*/zinc-*` as in the pattern.

- [ ] **Step 2: Apply design to remaining pages**

Repeat for each page in order: `app/tasks/`, `app/projects/`, `app/sprints/`, `app/time/`, `app/review/`, `app/settings/`, `app/templates/`. Each page: read → update class names → verify in browser.

- [ ] **Step 3: Update `components/SprintBadge.tsx`, `components/UrgencyBadge.tsx`, `components/CapacityBar.tsx`**

Read each component. Update colors:
- SprintBadge: use `bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900`
- UrgencyBadge: use red/amber/green variants following same pattern
- CapacityBar: `bg-slate-100 dark:bg-zinc-800` track, `bg-blue-500` fill

- [ ] **Step 4: Commit after all pages are updated**

```bash
git add app/ components/
git commit -m "feat: apply new design system across all pages"
```

---

## Phase 6: Focus Mode

### Task 14: Build Focus Mode page

**Files:**
- Create: `app/focus/page.tsx`
- Create: `components/StickyPile.tsx`

- [ ] **Step 1: Create `components/StickyPile.tsx`**

This is a client component that renders the animated sticky note pile.

```tsx
"use client";

import { useState } from "react";

type Task = {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
};

type Props = {
  tasks: Task[];
  onComplete: (taskId: string) => void;
  onAllDone: () => void;
};

export function StickyPile({ tasks, onComplete, onAllDone }: Props) {
  const [current, setCurrent] = useState(0);
  const [peeling, setPeeling] = useState(false);

  if (tasks.length === 0 || current >= tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">🎉</div>
        <div className="text-xl font-bold text-slate-900 dark:text-white">
          All done!
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          You cleared your pile.
        </p>
        <button
          onClick={onAllDone}
          className="mt-2 px-4 py-2 border border-slate-200 dark:border-zinc-700 text-sm font-medium rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Start a new pile
        </button>
      </div>
    );
  }

  const task = tasks[current];
  const remaining = tasks.length - current;

  function handleDone() {
    if (peeling) return;
    setPeeling(true);
    onComplete(task.id);
    setTimeout(() => {
      setCurrent((c) => c + 1);
      setPeeling(false);
    }, 380);
  }

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Pile */}
      <div className="relative w-72 h-72">
        {/* Shadow notes underneath */}
        {remaining > 2 && (
          <div
            className="absolute inset-0 bg-amber-300 rounded-sm"
            style={{ transform: "rotate(3deg) translate(6px, 8px)", opacity: 0.4 }}
          />
        )}
        {remaining > 1 && (
          <div
            className="absolute inset-0 bg-amber-200 rounded-sm"
            style={{ transform: "rotate(-1.5deg) translate(3px, 5px)", opacity: 0.65 }}
          />
        )}

        {/* Top note */}
        <div
          className="absolute inset-0 bg-yellow-100 dark:bg-yellow-200 rounded-sm shadow-lg flex flex-col p-7"
          style={{
            transition: peeling ? "transform 0.35s ease-in, opacity 0.35s ease-in" : undefined,
            transform: peeling ? "translateY(-120%) rotate(-4deg)" : "rotate(0deg)",
            opacity: peeling ? 0 : 1,
          }}
        >
          <div className="text-[11px] font-semibold text-amber-700 opacity-60 mb-3">
            {current + 1} of {tasks.length}
          </div>
          <div className="text-[17px] font-semibold text-slate-900 leading-snug flex-1">
            {task.name}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-800">
              Sprint {task.sprint}
            </span>
            <span className="text-[11px] text-amber-700 opacity-60">
              {task.estMinutes} min
            </span>
          </div>
        </div>
      </div>

      {/* Done button */}
      <button
        onClick={handleDone}
        disabled={peeling}
        className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-xl shadow-md hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✓ Done — next task
      </button>

      <p className="text-xs text-slate-400 dark:text-zinc-500">
        {remaining - 1} task{remaining - 1 === 1 ? "" : "s"} remaining
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/focus/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { StickyPile } from "@/components/StickyPile";

type Task = {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
};

export default function FocusPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data: Task[]) => {
        setTasks(data.filter((t) => !t.done));
        setLoading(false);
      });
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startSession() {
    const pile = tasks.filter((t) => selected.has(t.id));
    setSession(pile);
  }

  async function completeTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function resetSession() {
    setSession(null);
    setSelected(new Set());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400 dark:text-zinc-500">
        Loading tasks…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Focus Mode
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Pick your tasks, then work through the pile one by one
          </p>
        </div>
        {session && (
          <button
            onClick={resetSession}
            className="px-3 py-1.5 border border-slate-200 dark:border-zinc-700 text-sm font-medium rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ← New pile
          </button>
        )}
      </div>

      {session ? (
        /* Active session: show the pile */
        <div className="flex justify-center py-8">
          <StickyPile
            tasks={session}
            onComplete={completeTask}
            onAllDone={resetSession}
          />
        </div>
      ) : (
        /* Task selection */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Task list */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4">
              Build your pile — select tasks
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-4">
                No incomplete tasks. Add some in the Tasks page first.
              </p>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-zinc-800">
                {tasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex items-center gap-3 py-2.5 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(task.id)}
                      onChange={() => toggle(task.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 text-blue-500 focus:ring-blue-500/20"
                    />
                    <span className="flex-1 text-sm text-slate-800 dark:text-zinc-200">
                      {task.name}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900">
                      S{task.sprint}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-zinc-500 w-10 text-right">
                      {task.estMinutes}m
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={startSession}
              disabled={selected.size === 0}
              className="mt-4 w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Focus Session →
            </button>
          </div>

          {/* Pile preview */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4">
              Your pile ({selected.size} task{selected.size === 1 ? "" : "s"})
            </div>

            {selected.size === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div
                  className="w-48 h-48 bg-amber-50 dark:bg-amber-100 rounded-sm shadow-md flex items-center justify-center"
                  style={{ transform: "rotate(1deg)" }}
                >
                  <p className="text-xs text-amber-400 text-center px-4">
                    Check tasks to add them here
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="relative w-48 h-48">
                  {selected.size > 2 && (
                    <div
                      className="absolute inset-0 bg-amber-300 rounded-sm"
                      style={{ transform: "rotate(3deg) translate(5px, 7px)", opacity: 0.4 }}
                    />
                  )}
                  {selected.size > 1 && (
                    <div
                      className="absolute inset-0 bg-amber-200 rounded-sm"
                      style={{ transform: "rotate(-1.5deg) translate(3px, 4px)", opacity: 0.65 }}
                    />
                  )}
                  <div
                    className="absolute inset-0 bg-yellow-100 rounded-sm shadow-md flex flex-col p-5"
                  >
                    <div className="text-[10px] font-semibold text-amber-700 opacity-60 mb-2">
                      1 of {selected.size}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {tasks.find((t) => selected.has(t.id))?.name}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 dark:text-zinc-500">
                  {selected.size} task{selected.size === 1 ? "" : "s"} queued
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify Focus Mode works end-to-end**

1. `npm run dev`
2. Go to http://localhost:3000/focus
3. Check 2–3 tasks and verify the pile preview updates
4. Click "Start Focus Session" — pile should appear with first task
5. Click "Done — next task" — top note should slide up and fade, next note appears
6. Complete all tasks — "All done!" screen should appear
7. Go to http://localhost:3000/tasks — completed tasks should be marked done

- [ ] **Step 4: Commit**

```bash
git add app/focus/ components/StickyPile.tsx
git commit -m "feat: add Focus Mode with sticky note pile and peel animation"
```

---

## Phase 7: Vercel Deployment

### Task 15: Deploy to Vercel

**Files:** none (external setup + env vars)

- [ ] **Step 1: Update Supabase redirect URLs for production**

After you deploy, go to Supabase → Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Add to Redirect URLs: `https://your-app.vercel.app/auth/callback`

- [ ] **Step 2: Connect Vercel to GitHub**

Go to vercel.com → New Project → Import `flow` repository → Framework: Next.js (auto-detected) → Deploy.

- [ ] **Step 3: Add environment variables in Vercel**

In Vercel → Project Settings → Environment Variables, add:

| Name | Value | Environments |
|---|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[PROJECT_REF].supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | Production, Preview, Development |
| `ANTHROPIC_API_KEY` | your Anthropic key | Production, Preview, Development |

- [ ] **Step 4: Update build command to run migrations**

In Vercel → Project Settings → Build & Output Settings → Build Command:

```
prisma migrate deploy && next build
```

This ensures any pending migrations run on each deploy.

- [ ] **Step 5: Trigger a redeploy**

Vercel → Deployments → Redeploy (or push a new commit to main).

- [ ] **Step 6: Verify production deployment**

1. Open your Vercel URL
2. Should redirect to `/login`
3. Sign in with Google or GitHub
4. All features should work: create a task, open Focus Mode, check Daily

- [ ] **Step 7: Push final state**

```bash
git add .
git push origin main
```

---

## Spec Coverage Check

| Spec section | Tasks |
|---|---|
| Publish to GitHub | Task 1 |
| Supabase PostgreSQL | Tasks 2, 3, 4 |
| Google + GitHub OAuth | Tasks 5, 6, 7, 8 |
| Persistent sessions | Tasks 6, 8 (Supabase handles via cookies) |
| userId data scoping | Tasks 9, 10 |
| UI redesign (light + dark) | Tasks 11, 12, 13 |
| Focus Mode page | Tasks 14 |
| Vercel auto-deploy | Task 15 |
| `.env` and `dev.db` gitignored | Task 1 |
| Avatar with sign-out | Task 12 |
