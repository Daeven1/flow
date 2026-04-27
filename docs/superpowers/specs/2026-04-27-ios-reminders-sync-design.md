# iOS Reminders Bidirectional Sync Design

**Date:** 2026-04-27
**Status:** Approved

## Overview

Bidirectional sync between iOS Reminders and the Flow tasks table. A dedicated Reminders list ("Flow Tasks") stays in sync with Supabase-backed tasks via three iOS Shortcuts and four API routes.

- **Reminders → App** (event-driven): Shortcuts fire when a Reminder is added or completed → call API routes to create/complete the matching task.
- **App → Reminders** (polling every 15 min): A scheduled Shortcut fetches tasks that need a Reminder created or completed, acts on them, and writes back the iOS Reminder identifier.

---

## Schema Changes

Add two fields to the `Task` model in `prisma/schema.prisma`:

```prisma
reminderId  String?
syncedFrom  String   @default("app")
```

- `reminderId` — stores the iOS Reminder's unique identifier (provided by Shortcuts). Once set, a task is considered synced and won't be picked up by the pending queue again.
- `syncedFrom` — `"app"` (default) or `"reminders"`. Prevents echo loops: tasks born in Reminders skip the pending queue; tasks born in the app are ignored by the create-task route.

Migration: `npx prisma migrate dev --name add_reminder_sync_fields`

---

## Auth

A single env var `SHORTCUTS_SECRET` holds a shared secret. API keys are formatted as:

```
userId.secret
```

e.g. `clabcdef123.mysupersecret`

Routes split on the first `.`, validate the suffix against `SHORTCUTS_SECRET`, and use the prefix as `userId`. Shortcuts pass this in every request as:

```
X-Api-Key: userId.secret
```

If the header is missing or the secret doesn't match, routes return `401 { error: "Unauthorized" }`.

Add `SHORTCUTS_SECRET` to `.env` and Vercel environment variables.

---

## API Routes

All routes live in `app/api/reminders/`. They use the API key auth described above — not the Supabase session auth used by other routes.

### POST `/api/reminders/create-task`

Called by Shortcut 1 when a new Reminder is added to "Flow Tasks".

**Body:**
```json
{ "title": "Task name", "due_date": "2026-05-01", "reminder_id": "ABC-123" }
```
- `due_date` is optional (ISO date string)
- `reminder_id` is the iOS Reminder's unique identifier

**Behavior:**
1. Validate API key → extract `userId`
2. If a task with `reminderId = reminder_id` already exists for this user, return `{ success: true, task_id }` (idempotent, no duplicate)
3. Create task with:
   - `name`: title
   - `deadline`: due_date (if provided, parsed as Date)
   - `scheduledDate`: computed via `computeScheduledDate` if deadline is present (same logic as the main POST `/api/tasks` route)
   - `sprint`: 1
   - `syncedFrom`: `"reminders"`
   - `reminderId`: reminder_id
   - `workCategory`: `"STANDARD"`
   - `estMinutes`: 30
   - `leadDays`: 0
4. Return `{ success: true, task_id }`

### PATCH `/api/reminders/complete-task`

Called by Shortcut 2 when a Reminder is completed in "Flow Tasks".

**Body:**
```json
{ "reminder_id": "ABC-123" }
```

**Behavior:**
1. Validate API key → extract `userId`
2. Find task where `userId = userId AND reminderId = reminder_id`
3. If not found, return `{ success: true }` (no-op — task may have been deleted)
4. Set `done = true`, `doneAt = now()`
5. Return `{ success: true }`

### GET `/api/reminders/pending`

Called by Shortcut 3 (polling) to get tasks that need action.

**Behavior:**
1. Validate API key → extract `userId`
2. Query and return:

```json
{
  "needsReminder": [
    { "id": "...", "name": "...", "deadline": "2026-05-01T00:00:00Z" }
  ],
  "needsCompletion": [
    { "id": "...", "name": "...", "reminderId": "ABC-123" }
  ]
}
```

- `needsReminder`: tasks where `syncedFrom = "app"` AND `reminderId IS NULL` AND `done = false`
- `needsCompletion`: tasks where `syncedFrom = "app"` AND `done = true` AND `reminderId IS NOT NULL`

### PATCH `/api/tasks/[id]` (existing route — extend)

Add `reminderId` to the accepted fields so Shortcut 3 can write back the iOS identifier after creating a Reminder.

The existing route already uses a presence-check pattern (`if ("field" in body)`), so this is a one-line addition.

---

## Loop Prevention

| Scenario | How it's prevented |
|---|---|
| Shortcut adds Reminder → app creates task → Shortcut fires again | Task has `syncedFrom = "reminders"` — it won't appear in `needsReminder` |
| App creates task → Shortcut 3 creates Reminder → Shortcut 1 fires | Task already has `reminderId` set (written back by Shortcut 3) — `create-task` route returns early if `reminderId` already exists |
| Reminder completed → app marks done → Shortcut 3 tries to complete again | Task `done = true` but `syncedFrom = "reminders"` — excluded from `needsCompletion` (which only includes `syncedFrom = "app"` tasks) |

---

## iOS Shortcuts Setup

Create a Reminders list called **"Flow Tasks"** before setting up the Shortcuts.

### Shortcut 1: "Flow — New Reminder"

**Trigger:** Settings → Shortcuts → Automation → New Automation → When "A Reminder is added" to list "Flow Tasks" → Run immediately, no confirmation.

**Steps:**
1. Receive input from Shortcut (Reminder)
2. Get Details of Reminder → Title, Due Date, Identifier
3. URL: `https://flow-lake-rho.vercel.app/api/reminders/create-task`
4. Get Contents of URL (POST, JSON body):
   ```json
   { "title": "<Title>", "due_date": "<Due Date>", "reminder_id": "<Identifier>" }
   ```
   Header: `X-Api-Key: userId.secret`

### Shortcut 2: "Flow — Complete Reminder"

**Trigger:** Settings → Shortcuts → Automation → New Automation → When "A Reminder is completed" in list "Flow Tasks" → Run immediately, no confirmation.

**Steps:**
1. Receive input from Shortcut (Reminder)
2. Get Details of Reminder → Identifier
3. URL: `https://flow-lake-rho.vercel.app/api/reminders/complete-task`
4. Get Contents of URL (PATCH, JSON body):
   ```json
   { "reminder_id": "<Identifier>" }
   ```
   Header: `X-Api-Key: userId.secret`

### Shortcut 3: "Flow — Sync to Reminders"

**Trigger:** Settings → Shortcuts → Automation → New Automation → Time of Day → every 15 minutes → Run immediately, no confirmation.

**Steps:**
1. URL: `https://flow-lake-rho.vercel.app/api/reminders/pending`
2. Get Contents of URL (GET), Header: `X-Api-Key: userId.secret`
3. Get Dictionary from result
4. **For each item in `needsReminder`:**
   - Add New Reminder to list "Flow Tasks" with title = item.name, due date = item.deadline (if present)
   - Get Details of new Reminder → Identifier
   - URL: `https://flow-lake-rho.vercel.app/api/tasks/<item.id>`
   - Get Contents of URL (PATCH, JSON body): `{ "reminderId": "<Identifier>" }`
     Header: `X-Api-Key: userId.secret`
5. **For each item in `needsCompletion`:**
   - Find Reminders in list "Flow Tasks" where Title = item.name (iOS Shortcuts "Find Reminders" action; matching by name is the most reliable cross-iOS-version approach since Reminder identifier filtering is not consistently available in Shortcuts)
   - Mark Reminder as Completed

---

## Env Vars

| Variable | Where | Value |
|---|---|---|
| `SHORTCUTS_SECRET` | `.env` + Vercel | A random secret string you choose |

Each user's API key is: `<their_supabase_userId>.<SHORTCUTS_SECRET>`

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `reminderId`, `syncedFrom` to Task |
| `prisma/migrations/...` | New migration |
| `app/api/reminders/create-task/route.ts` | New |
| `app/api/reminders/complete-task/route.ts` | New |
| `app/api/reminders/pending/route.ts` | New |
| `app/api/tasks/[id]/route.ts` | Add `reminderId` to PATCH handler |
| `.env` | Add `SHORTCUTS_SECRET` |
| Vercel dashboard | Add `SHORTCUTS_SECRET` env var |
