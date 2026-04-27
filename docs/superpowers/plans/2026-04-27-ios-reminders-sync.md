# iOS Reminders Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional sync between iOS Reminders and the Flow tasks table via three iOS Shortcuts and four API routes, with loop-prevention via a `syncedFrom` field and a `reminderId` field that tracks the iOS Reminder's identifier.

**Architecture:** Event-driven for Reminders → App (Shortcuts fire on Reminder add/complete, call dedicated API routes). Polling for App → Reminders (Shortcut 3 runs every 15 min, calls `GET /api/reminders/pending`, creates/completes Reminders, writes back the identifier). A shared `validateApiKey` helper in `lib/remindersAuth.ts` handles auth for all reminders routes — API keys are `userId.SHORTCUTS_SECRET`, routes split on the first `.`.

**Tech Stack:** Prisma 5, Next.js 16 App Router, TypeScript, `@/lib/utils` (`computeScheduledDate`), `@/lib/workNightDays` (`getWorkNightDays`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `reminderId String?` and `syncedFrom String @default("app")` to Task |
| `prisma/migrations/20260427140000_add_reminder_sync_fields/` | Create | Migration SQL |
| `lib/remindersAuth.ts` | Create | `validateApiKey(req) → userId \| null` |
| `app/api/reminders/create-task/route.ts` | Create | POST — Shortcut 1 creates a task from a Reminder |
| `app/api/reminders/complete-task/route.ts` | Create | PATCH — Shortcut 2 marks a task done |
| `app/api/reminders/pending/route.ts` | Create | GET — Shortcut 3 polls for tasks needing sync |
| `app/api/tasks/[id]/route.ts` | Modify | Add `reminderId` to PATCH handler |
| `.env` | Modify | Add `SHORTCUTS_SECRET=<your-secret>` |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260427140000_add_reminder_sync_fields/migration.sql`

- [ ] **Step 1: Add fields to Task model in schema.prisma**

Find the `model Task {` block. After the existing `pinned Boolean @default(false)` line, add:

```prisma
  reminderId    String?
  syncedFrom    String    @default("app")
```

The Task model should now include (showing surrounding context):
```prisma
  pinned        Boolean   @default(false)
  done          Boolean   @default(false)
  doneAt        DateTime?
  reminderId    String?
  syncedFrom    String    @default("app")
  createdAt     DateTime  @default(now())
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_reminder_sync_fields
```

Expected output:
```
Applying migration `20260427140000_add_reminder_sync_fields`
The following migration(s) have been applied:
migrations/
  └─ 20260427140000_add_reminder_sync_fields/
    └─ migration.sql
```

- [ ] **Step 3: Verify migration status**

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add reminderId and syncedFrom fields to Task model"
```

---

## Task 2: Auth Helper

**Files:**
- Create: `lib/remindersAuth.ts`

This is a pure function — no Prisma, no Supabase. It reads `process.env.SHORTCUTS_SECRET`, splits the key, and returns the userId prefix or null.

- [ ] **Step 1: Add SHORTCUTS_SECRET to .env**

Open `.env` and add:
```
SHORTCUTS_SECRET=replace-with-a-strong-random-string
```

Generate a value with: `openssl rand -hex 32`

- [ ] **Step 2: Create lib/remindersAuth.ts**

```typescript
export function validateApiKey(req: Request): string | null {
  const key = req.headers.get("x-api-key");
  if (!key) return null;

  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) return null;

  const userId = key.slice(0, dotIndex);
  const secret = key.slice(dotIndex + 1);

  if (!process.env.SHORTCUTS_SECRET || secret !== process.env.SHORTCUTS_SECRET) return null;
  if (!userId) return null;

  return userId;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add lib/remindersAuth.ts .env
git commit -m "feat: add API key auth helper for Shortcuts routes"
```

---

## Task 3: POST /api/reminders/create-task

**Files:**
- Create: `app/api/reminders/create-task/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";
import { computeScheduledDate } from "@/lib/utils";
import { getWorkNightDays } from "@/lib/workNightDays";

export async function POST(req: Request) {
  const userId = validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, due_date, reminder_id } = body;

  if (!title || !reminder_id) {
    return NextResponse.json({ error: "Missing required fields: title, reminder_id" }, { status: 400 });
  }

  // Idempotency: if a task with this reminderId already exists, return it
  const existing = await prisma.task.findFirst({
    where: { userId, reminderId: reminder_id },
  });
  if (existing) {
    return NextResponse.json({ success: true, task_id: existing.id });
  }

  const deadline = due_date ? new Date(due_date) : null;
  let scheduledDate: Date | null = null;
  if (deadline) {
    const workNightDays = await getWorkNightDays(userId);
    scheduledDate = computeScheduledDate(deadline, "STANDARD", 30, workNightDays);
  }

  const task = await prisma.task.create({
    data: {
      userId,
      name: title,
      deadline,
      scheduledDate,
      sprint: 1,
      syncedFrom: "reminders",
      reminderId: reminder_id,
      workCategory: "STANDARD",
      estMinutes: 30,
      leadDays: 0,
    },
  });

  return NextResponse.json({ success: true, task_id: task.id }, { status: 201 });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Smoke test with curl**

Replace `YOUR_USER_ID` with your actual Supabase userId and `YOUR_SECRET` with the value from `.env`:

```bash
curl -X POST http://localhost:3000/api/reminders/create-task \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET" \
  -d '{"title":"Test from Reminders","due_date":"2026-05-01","reminder_id":"test-reminder-001"}'
```

Expected response:
```json
{"success":true,"task_id":"<some-cuid>"}
```

Run it a second time with the same `reminder_id` — should return the same `task_id` (idempotent).

Test missing auth:
```bash
curl -X POST http://localhost:3000/api/reminders/create-task \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","reminder_id":"test-001"}'
```

Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 4: Commit**

```bash
git add app/api/reminders/create-task/route.ts
git commit -m "feat: add POST /api/reminders/create-task route"
```

---

## Task 4: PATCH /api/reminders/complete-task

**Files:**
- Create: `app/api/reminders/complete-task/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";

export async function PATCH(req: Request) {
  const userId = validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { reminder_id } = body;

  if (!reminder_id) {
    return NextResponse.json({ error: "Missing required field: reminder_id" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { userId, reminderId: reminder_id },
  });

  if (!task) {
    return NextResponse.json({ success: true }); // no-op: task deleted or not found
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { done: true, doneAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Smoke test with curl**

Use the `task_id` created in Task 3's smoke test to find the `reminder_id` (`test-reminder-001`):

```bash
curl -X PATCH http://localhost:3000/api/reminders/complete-task \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET" \
  -d '{"reminder_id":"test-reminder-001"}'
```

Expected: `{"success":true}`

Check the task is now done in the database:
```bash
npx prisma studio
```
Open the Task table and confirm `done = true` and `doneAt` is set.

Test with a non-existent reminder_id (should return success, not error):
```bash
curl -X PATCH http://localhost:3000/api/reminders/complete-task \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET" \
  -d '{"reminder_id":"does-not-exist"}'
```

Expected: `{"success":true}`

- [ ] **Step 4: Commit**

```bash
git add app/api/reminders/complete-task/route.ts
git commit -m "feat: add PATCH /api/reminders/complete-task route"
```

---

## Task 5: GET /api/reminders/pending

**Files:**
- Create: `app/api/reminders/pending/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/remindersAuth";

export async function GET(req: Request) {
  const userId = validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [needsReminder, needsCompletion] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        syncedFrom: "app",
        reminderId: null,
        done: false,
      },
      select: { id: true, name: true, deadline: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        syncedFrom: "app",
        done: true,
        NOT: { reminderId: null },
      },
      select: { id: true, name: true, reminderId: true },
    }),
  ]);

  return NextResponse.json({ needsReminder, needsCompletion });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Smoke test with curl**

```bash
curl http://localhost:3000/api/reminders/pending \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET"
```

Expected shape:
```json
{
  "needsReminder": [
    { "id": "...", "name": "...", "deadline": null }
  ],
  "needsCompletion": []
}
```

`needsReminder` should contain any tasks you created in the app (syncedFrom = "app", reminderId = null, done = false). `needsCompletion` will be empty unless you have done tasks with a reminderId set via the app.

- [ ] **Step 4: Commit**

```bash
git add app/api/reminders/pending/route.ts
git commit -m "feat: add GET /api/reminders/pending route"
```

---

## Task 6: Extend PATCH /api/tasks/[id] with reminderId

**Files:**
- Modify: `app/api/tasks/[id]/route.ts`

The existing PATCH handler uses a presence-check pattern. Add one line for `reminderId`.

- [ ] **Step 1: Add reminderId to the PATCH handler**

In `app/api/tasks/[id]/route.ts`, find this block inside the PATCH function:

```typescript
  if ("leadDays" in body) data.leadDays = Number(body.leadDays);
```

Add the following line immediately after it:

```typescript
  if ("reminderId" in body) data.reminderId = body.reminderId ?? null;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Smoke test with curl**

Create a task in the app, find its ID (use Prisma Studio or the GET /api/tasks response), then patch its reminderId:

```bash
curl -X PATCH http://localhost:3000/api/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET" \
  -d '{"reminderId":"ios-reminder-abc-123"}'
```

Note: this route uses Supabase session auth, not API key auth. Test it from the browser's dev console while logged in, or use a valid session cookie. The curl above is for shape validation only — in production Shortcut 3 calls this route with the API key, but the existing route uses session auth.

Wait — per the spec, Shortcut 3 calls `PATCH /api/tasks/[id]` with the `X-Api-Key` header. But the existing route uses `getUser()` (session auth). **This route needs to also accept API key auth for the `reminderId` write-back.**

Update the top of `app/api/tasks/[id]/route.ts` to add a static import, then update the PATCH handler to try API key auth as a fallback:

Add to the imports at the top of the file:
```typescript
import { validateApiKey } from "@/lib/remindersAuth";
```

Then replace the first three lines of the PATCH function:
```typescript
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

With:
```typescript
  const userId = (await getUser()) ?? validateApiKey(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Smoke test the API key path**

```bash
curl -X PATCH http://localhost:3000/api/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET" \
  -d '{"reminderId":"ios-reminder-abc-123"}'
```

Expected: task JSON response with `reminderId: "ios-reminder-abc-123"`.

Confirm the task no longer appears in `GET /api/reminders/pending` → `needsReminder`:

```bash
curl http://localhost:3000/api/reminders/pending \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET"
```

Expected: the task is absent from `needsReminder` (it now has a reminderId).

- [ ] **Step 6: Commit**

```bash
git add app/api/tasks/[id]/route.ts
git commit -m "feat: add reminderId to task PATCH, support API key auth for Shortcuts write-back"
```

---

## Task 7: Add SHORTCUTS_SECRET to Vercel and Deploy

**Files:**
- Vercel dashboard (no code changes)

- [ ] **Step 1: Add env var to Vercel**

```bash
vercel env add SHORTCUTS_SECRET production
```

When prompted, paste the same value you used in `.env`.

- [ ] **Step 2: Deploy to production**

```bash
vercel --prod
```

Expected: deployment completes, live URL is `https://flow-lake-rho.vercel.app`.

- [ ] **Step 3: Smoke test production routes**

```bash
curl -X POST https://flow-lake-rho.vercel.app/api/reminders/create-task \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET" \
  -d '{"title":"Production test","reminder_id":"prod-test-001"}'
```

Expected: `{"success":true,"task_id":"..."}` — verify the task appears in the app.

```bash
curl https://flow-lake-rho.vercel.app/api/reminders/pending \
  -H "X-Api-Key: YOUR_USER_ID.YOUR_SECRET"
```

Expected: JSON with `needsReminder` and `needsCompletion` arrays.

- [ ] **Step 4: Commit .env note (not the secret itself)**

`.env` is gitignored. No commit needed for the secret value. If you want to document the required env vars, update `.env.example` if one exists.

---

## Task 8: iOS Shortcuts Setup Guide

This task has no code — it's the Shortcut configuration steps to perform on your iPhone.

**Prerequisites:**
- App is deployed and production routes are smoke-tested (Task 7 complete)
- Your API key: `YOUR_USER_ID.YOUR_SECRET` (find your userId in Supabase → Authentication → Users)
- Create a Reminders list called **"Flow Tasks"** before starting

---

### Shortcut 1: "Flow — New Reminder"

- [ ] **Step 1: Create the automation**

On iPhone: Settings → Shortcuts → Automation → + → Personal Automation → Reminders → "A Reminder is Added" → List: "Flow Tasks" → Next

- [ ] **Step 2: Add actions**

1. Add action: **"Receive" (Shortcut Input)** → set type to Reminder
2. Add action: **"Get Details of Reminder"** → select input from step 1 → get Title, Due Date, Identifier
3. Add action: **"URL"** → enter: `https://flow-lake-rho.vercel.app/api/reminders/create-task`
4. Add action: **"Get Contents of URL"** → Method: POST → Request Body: JSON → add three fields:
   - `title` → value: Title (from step 2)
   - `due_date` → value: Due Date (from step 2)
   - `reminder_id` → value: Identifier (from step 2)
   Add header: `X-Api-Key` → value: `YOUR_USER_ID.YOUR_SECRET`

- [ ] **Step 3: Set to run immediately**

On the final screen: turn off "Ask Before Running" → Done.

- [ ] **Step 4: Test**

Add a reminder called "Test task from Reminders" to the "Flow Tasks" list. Open the Flow app and verify the task appears.

---

### Shortcut 2: "Flow — Complete Reminder"

- [ ] **Step 1: Create the automation**

On iPhone: Settings → Shortcuts → Automation → + → Personal Automation → Reminders → "A Reminder is Completed" → List: "Flow Tasks" → Next

- [ ] **Step 2: Add actions**

1. Add action: **"Receive" (Shortcut Input)** → set type to Reminder
2. Add action: **"Get Details of Reminder"** → select input from step 1 → get Identifier
3. Add action: **"URL"** → enter: `https://flow-lake-rho.vercel.app/api/reminders/complete-task`
4. Add action: **"Get Contents of URL"** → Method: PATCH → Request Body: JSON → add one field:
   - `reminder_id` → value: Identifier (from step 2)
   Add header: `X-Api-Key` → value: `YOUR_USER_ID.YOUR_SECRET`

- [ ] **Step 3: Set to run immediately**

Turn off "Ask Before Running" → Done.

- [ ] **Step 4: Test**

Complete the "Test task from Reminders" Reminder in the "Flow Tasks" list. Open the Flow app and verify the task is marked done.

---

### Shortcut 3: "Flow — Sync to Reminders"

- [ ] **Step 1: Create the automation**

On iPhone: Settings → Shortcuts → Automation → + → Personal Automation → Time of Day → set to "Every 15 Minutes" (or choose "Every Hour" for lower battery impact) → Next

- [ ] **Step 2: Add actions**

1. Add action: **"URL"** → enter: `https://flow-lake-rho.vercel.app/api/reminders/pending`
2. Add action: **"Get Contents of URL"** → Method: GET → add header: `X-Api-Key` → `YOUR_USER_ID.YOUR_SECRET`
3. Add action: **"Get Dictionary from Input"** → input: Contents of URL
4. Add action: **"Get Dictionary Value"** → key: `needsReminder` → from dictionary in step 3
5. Add action: **"Repeat with Each"** (loop over needsReminder items):
   - Add action: **"Get Dictionary Value"** → key: `name` → from Repeat Item
   - Add action: **"Get Dictionary Value"** → key: `deadline` → from Repeat Item
   - Add action: **"Add New Reminder"** → Title: name value → Due Date: deadline value (if not empty) → List: "Flow Tasks"
   - Add action: **"Get Details of Reminder"** → get Identifier of the new Reminder
   - Add action: **"Get Dictionary Value"** → key: `id` → from Repeat Item
   - Add action: **"URL"** → `https://flow-lake-rho.vercel.app/api/tasks/` + id value
   - Add action: **"Get Contents of URL"** → Method: PATCH → Request Body: JSON → field: `reminderId` → value: Identifier. Header: `X-Api-Key` → `YOUR_USER_ID.YOUR_SECRET`
   - End Repeat
6. Add action: **"Get Dictionary Value"** → key: `needsCompletion` → from dictionary in step 3
7. Add action: **"Repeat with Each"** (loop over needsCompletion items):
   - Add action: **"Get Dictionary Value"** → key: `name` → from Repeat Item
   - Add action: **"Find Reminders"** → filter: Title is name value → List: "Flow Tasks"
   - Add action: **"Mark as Completed"** → input: Found Reminders
   - End Repeat

- [ ] **Step 3: Set to run immediately**

Turn off "Ask Before Running" → Done.

- [ ] **Step 4: Test**

Create a task in the Flow app. Wait up to 15 min (or trigger the Shortcut manually from the Shortcuts app). Verify a Reminder appears in the "Flow Tasks" list. Then mark the task done in the Flow app, wait for next poll, and verify the Reminder is completed.
