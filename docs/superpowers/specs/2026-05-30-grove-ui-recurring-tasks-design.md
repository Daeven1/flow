# Grove — UI Refresh & Recurring Tasks Design

**Date:** 2026-05-30  
**Status:** Approved

---

## 1. UI Changes — Daily Page

### 1.1 Section rename and restyling

| Old name | New name | Accent colour (light) | Accent colour (dark) |
|---|---|---|---|
| Today's Highlight | ☀️ Sunshine | `#FEFCE8` bg / `#FDE68A` border / `#A16207` text | `#1c1a0f` bg / `#92400e` border / `#FDE68A` text |
| Micro-commitment | 🌱 Sprout | `#F0FDF4` bg / `#86EFAC` border / `#166534` text | `#052e16` bg / `#166534` border / `#86EFAC` text |

Copy changes:
- Sunshine subheading: *"The ONE thing that would make today a win."*
- Sprout subheading: *"The smallest next action you can start right now."*

### 1.2 Section order on `/daily`

New order (top to bottom):

1. Date heading + subtitle
2. Stats row (4 cards)
3. The Gain (did-list)
4. Today's Forage (urgent tasks, if any)
5. Fertile Ground (brain dump)
6. **☀️ Sunshine** ← moved up from near-bottom
7. **🌱 Sprout** ← moved up from near-bottom
8. Today's Work (scheduled tasks by sprint)
9. Coming Up (next 7 days)

Rationale: intention-setting (Sunshine + Sprout) flows naturally after the brain dump while focus is fresh, before the task list.

### 1.3 App background colours

| Mode | Colour | Hex |
|---|---|---|
| Light mode | Calm Pool | `#E0EFFE` |
| Dark mode | Midnight Navy | `#0D1B2E` |

Applied to `<body>` / root layout. All existing white cards (`bg-white dark:bg-zinc-900`) remain white — the background change gives them natural lift without any card redesign.

Implementation: update `globals.css` (or the root `layout.tsx` body class) to use these values, ensuring the `grove-theme` localStorage toggle switches between them correctly.

---

## 2. Recurring Tasks

### 2.1 Overview

Recurring tasks are templates that automatically spawn a new Task instance each time their scheduled recurrence date arrives. Undone instances carry over as overdue tasks; fresh instances spawn regardless.

### 2.2 Data model

**New table: `RecurringTask`**

```prisma
model RecurringTask {
  id                 String    @id @default(cuid())
  userId             String
  name               String
  sprint             Int       @default(1)
  estMinutes         Int       @default(30)
  workCategory       WorkCategory @default(STANDARD)
  context            String    @default("PROFESSIONAL")
  recurrenceType     RecurrenceType
  recurrenceDays     String    @default("[]") // JSON int[] — day-of-week (0=Sun…6=Sat), used for WEEKLY
  recurrenceMonthDay Int?                      // 1–31, used for MONTHLY
  deadlineOffset     Int       @default(0)    // days after scheduledDate → deadline
  active             Boolean   @default(true)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  tasks              Task[]
}

enum RecurrenceType {
  DAILY
  WEEKLY
  MONTHLY
}
```

**Changes to `Task`:**

```prisma
recurringTaskId  String?
recurringTask    RecurringTask? @relation(fields: [recurringTaskId], references: [id])
```

### 2.3 Spawn logic

**Endpoint:** `POST /api/recurring/spawn`  
**Called by:** `/daily` and `/tasks` page `loadData` function — spawn is awaited before the tasks fetch so that newly-created instances are included in the task list on first load.

Algorithm:
1. Fetch all `RecurringTask` records where `userId = current user` and `active = true`
2. For each template, determine whether today is a recurrence date:
   - `DAILY` → always true
   - `WEEKLY` → `today.getDay()` is in `recurrenceDays`
   - `MONTHLY` → `today.getDate() === recurrenceMonthDay` (if `recurrenceMonthDay > daysInMonth`, fire on last day of month)
3. If today is a recurrence date, check whether a Task already exists with `recurringTaskId = template.id` AND `scheduledDate` within today (midnight–midnight UTC). If one exists, skip.
4. If no instance exists, create a Task:
   - `name`, `sprint`, `estMinutes`, `workCategory`, `context` from template
   - `scheduledDate` = today
   - `deadline` = today + `deadlineOffset` days
   - `recurringTaskId` = template id
   - `userId` = current user
   - `done` = false

**Missed days:** Only today is checked. No retroactive catch-up. Overdue carry-over (the existing undone task from a prior day) handles the backlog naturally.

### 2.4 API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/recurring` | List all RecurringTasks for user |
| POST | `/api/recurring` | Create a new RecurringTask |
| PATCH | `/api/recurring/[id]` | Update or pause (set `active`) |
| DELETE | `/api/recurring/[id]` | Delete template (does not delete spawned tasks) |
| POST | `/api/recurring/spawn` | Run spawn check for today |

All routes: `export const runtime = 'nodejs'`, auth via `getUser()`.

### 2.5 Tasks pane UI

A collapsible **"Recurring"** section sits below the main task list on `/tasks`. It is collapsed by default if no recurring tasks exist.

**Collapsed state:** Header row — "↻ Recurring · 3 active" with a chevron and a "+ New" button.

**Expanded state:** Table of recurring task templates, one row each:

| Column | Content |
|---|---|
| Name | Task name |
| Pattern | "Every Monday", "Daily", "1st of month" |
| Sprint | Sprint badge |
| Est | e.g. 30m |
| Deadline | "Same day" or "+2 days" |
| Active | Toggle (pause without deleting) |
| Actions | Edit (pencil) · Delete (trash) |

**New / Edit form** (inline expansion below the row, same pattern as existing task edit UI):
- Name (text input)
- Recurrence type: Daily / Weekly / Monthly (segmented control)
  - If Weekly: day-of-week picker (Mon–Sun checkboxes, multi-select)
  - If Monthly: day-of-month number input (1–31)
- Sprint (Select)
- Est. minutes (number input)
- Work category (STANDARD / GRADING toggle)
- Context (PROFESSIONAL / PERSONAL toggle)
- Deadline offset: "Due same day" / "+ ___ days" (number input, default 0)

### 2.6 Deleting a recurring task

Deleting a `RecurringTask` template removes the template only. Already-spawned Task instances are kept — they become regular tasks. The DELETE handler sets `recurringTaskId = null` on all spawned tasks before removing the template.

### 2.7 Edge cases

- **Monthly day > days in month** (e.g. 31st in February): spawn on the last day of that month.
- **Duplicate prevention:** the `recurringTaskId + scheduledDate` uniqueness check in spawn ensures a page refresh never creates double instances.
- **Paused templates:** `active = false` skips spawn entirely; existing undone instances remain.

---

## 3. Out of scope

- Semester/term-based recurrence (user will enter these as regular dated tasks each year)
- Email or push notifications for recurring tasks
- Editing a spawned instance does not affect the template

---

## 4. Files affected

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `RecurringTask` model, `RecurrenceType` enum, `recurringTaskId` on Task |
| `app/daily/page.tsx` | Reorder sections, rename/restyle Sunshine + Sprout, call spawn on mount |
| `app/tasks/page.tsx` | Add Recurring section, call spawn on mount |
| `app/globals.css` or `app/layout.tsx` | Apply Calm Pool / Midnight Navy backgrounds |
| `app/api/recurring/route.ts` | GET + POST |
| `app/api/recurring/[id]/route.ts` | PATCH + DELETE |
| `app/api/recurring/spawn/route.ts` | POST spawn logic |
