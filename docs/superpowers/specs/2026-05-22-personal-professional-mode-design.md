# Personal / Professional Mode — Design Spec
**Date:** 2026-05-22  
**Status:** Approved

---

## Overview

Three related improvements to the Grove daily page and app-wide experience:

1. **Fertile Ground** — rename and reposition the Brain Dump section
2. **Personal / Professional mode toggle** — app-wide context switch that filters tasks by life domain
3. **Forage drag order persistence** — preserve the user's manual ordering of Today's Forage across page refreshes

---

## 1. Fertile Ground (renamed Brain Dump)

### What changes
- The section previously called "Brain Dump" is renamed to **Fertile Ground**
- It moves up the page: from below Today's Highlight to **between Today's Forage and Today's Work**
- Its styling becomes a fixed dark earth-brown regardless of mode (Professional or Personal)

### Styling
- Section wrapper: `bg-stone-900` with `rounded-xl`
- Textarea: `bg-stone-950`, `text-stone-200`, placeholder `text-stone-600`
- Heading: "🌱 Fertile Ground" in `text-stone-300`, `font-bold text-sm`
- Subtitle: "Drop seeds here. One thought per line or free-write." in `text-stone-500`
- "Convert to tasks ↗" button: outline style, `border-stone-700 text-stone-300 hover:bg-stone-800`
- The parsed-task confirm panel (AI results) is unchanged in structure; inherits the stone palette for its container

### Behaviour
Identical to the current Brain Dump. The AI parse endpoint, save-to-daily-log logic, and parsed-task confirm UI are all unchanged. Only the name and position move.

---

## 2. Personal / Professional Mode Toggle

### Data model

Add one field to the `Task` table:

```prisma
context  String  @default("PROFESSIONAL")   // "PROFESSIONAL" | "PERSONAL"
```

Migration: all existing tasks default to `"PROFESSIONAL"`.

No other schema changes. `workCategory`, `sprint`, `deadline`, `scheduledDate` behave identically in both modes.

### ModeProvider (`components/ModeProvider.tsx`)

A React client-component context provider that wraps the app in `app/layout.tsx`.

**State shape:**
```ts
type Mode = "PROFESSIONAL" | "PERSONAL"
interface ModeContext { mode: Mode; setMode: (m: Mode) => void }
```

**On mount logic:**
1. Read `localStorage.getItem("grove-mode-date")` — today's date as `YYYY-MM-DD`
2. If stored date equals today → restore `localStorage.getItem("grove-mode")` as the current mode
3. If stored date differs from today (or missing) → derive mode from weekday rule:
   - Mon–Fri → `PROFESSIONAL`
   - Sat–Sun → `PERSONAL`
4. Write the derived/restored mode and today's date back to localStorage

**`setMode` behaviour:**
- Updates React state immediately
- Writes `grove-mode` and `grove-mode-date` (today) to localStorage

**Hook:**
```ts
export function useModeContext(): ModeContext
```
Throws if called outside `ModeProvider`.

### Nav toggle

The existing `Nav.tsx` gains the mode toggle. Reads `{ mode, setMode }` from `useModeContext()`.

**Appearance:** Segmented pill positioned between the nav link list and the right-side controls (dark mode + avatar).

```
[Grove]  [Daily] [Tasks] … [Projects]    [💼 Pro | 🌿 Home]   [☀]  [D]
```

- Pill container: `bg-slate-800 rounded-full p-0.5 flex gap-0.5 border border-slate-700`
- Active segment: `bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-semibold` (Professional) or `bg-green-600 text-white rounded-full px-3 py-1 text-xs font-semibold` (Personal)
- Inactive segment: `text-slate-400 px-3 py-1 text-xs font-semibold hover:text-white`
- Labels: `💼 Pro` and `🌿 Home`

### Personal mode aesthetic (Sunny Garden)

When `mode === "PERSONAL"`, the app applies a warm yellow-green palette. `ModeProvider` toggles a `personal-mode` class on `document.documentElement` (mirroring the existing `dark` class pattern), and pages apply conditional classNames from `useModeContext()`.

**Colour tokens:**
| Role | Professional | Personal |
|---|---|---|
| Page background | `bg-slate-50 dark:bg-zinc-950` | `bg-yellow-50` |
| Card background | `bg-white` | `bg-white` |
| Card border | `border-slate-200` | `border-yellow-200` |
| Heading text | `text-slate-900` | `text-lime-900` |
| Muted text | `text-slate-500` | `text-yellow-700` |
| Accent / active | blue-600 | green-600 |
| Nav bar | `bg-slate-900` | `bg-lime-950` |
| Nav active chip | `bg-slate-700` | `bg-green-800` |
| Nav active segment | `bg-blue-600` | `bg-green-600` |

Fertile Ground section is **always stone-brown** regardless of mode.

**Implementation approach:** `ModeProvider` calls `document.documentElement.classList.toggle("personal-mode", isPersonal)` on every mode change (same pattern as the existing dark mode toggle). `app/globals.css` adds a `.personal-mode` block that overrides CSS custom properties for background, border, and text colours. Components read `mode` from `useModeContext()` and apply conditional Tailwind classNames for anything not covered by the CSS variables (e.g. nav background, sprint badge accents).

### API filtering

Every API route that lists tasks gains an optional `context` query param that filters at the DB level:

```ts
// e.g. GET /api/tasks?context=PROFESSIONAL
where: { userId, ...(context ? { context } : {}) }
```

Routes affected:
- `GET /api/tasks`
- `GET /api/sprints` (sprint capacity view)
- `GET /api/timelogs` (time log history)
- Any task-list fetch inside `/focus` and `/review`

Routes **not** affected (unfiltered):
- `GET /api/projects` — projects span both contexts
- `GET /api/projects/[id]` — project detail tasks remain unfiltered

Each filtered page calls its API with `?context=${mode}` derived from `useModeContext()`.

### Task creation

- Every `POST /api/tasks` call accepts an optional `context` field (defaults to `"PROFESSIONAL"` server-side if omitted)
- Client-side: the current `mode` value is included in every task creation payload
- This applies to: manual add-task forms, Brain Dump / Fertile Ground AI-parsed tasks, the "Log something you just did" quick-add in The Gain

### Task edit — context switch

Every task inline-edit form gains a small `Pro | Personal` segmented toggle alongside the existing sprint/deadline/estimate controls. On save, the `context` value is included in the `PATCH /api/tasks/[id]` payload.

The toggle uses the same pill style as the nav but smaller (`text-xs`, `h-7`):
- `💼 Pro` / `🌿 Personal`

---

## 3. Forage Drag Order Persistence

**Problem:** `urgentCustomOrder` state resets on refresh — manual drag ordering is lost.

**Solution:** Store the order in `localStorage` keyed by today's date.

```
Key:   grove-forage-order-YYYY-MM-DD
Value: JSON array of task IDs in display order
```

**On mount** (`useEffect` in `app/daily/page.tsx`):
1. Read `grove-forage-order-${todayStr}` from localStorage
2. If present, seed `urgentCustomOrder` with the parsed array
3. The existing effect that syncs `urgentCustomOrder` when tasks change (appending new IDs, removing completed ones) still runs — it just initialises from the persisted value instead of empty

**On drag end** (`handleUrgentDragEnd`):
- After updating state, write the new order to `localStorage.setItem("grove-forage-order-${todayStr}", JSON.stringify(nextOrder))`

**Expiry:** Keys from previous days are simply ignored (never read). No cleanup needed — `localStorage` accumulates a small amount of stale keys but these are negligible in size.

---

## Page order (Daily) — after changes

1. Stats row (unchanged)
2. The Gain / Did List (unchanged)
3. Today's Forage (unchanged, order now persisted)
4. **Fertile Ground** ← moved up from bottom
5. Today's Work
6. Today's Highlight + Micro-commitment
7. Coming Up

---

## Files to create / modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `context String @default("PROFESSIONAL")` to Task |
| `prisma/migrations/…` | Auto-generated migration |
| `components/ModeProvider.tsx` | New — React Context provider |
| `components/Nav.tsx` | Add mode toggle pill, consume `useModeContext()` |
| `app/layout.tsx` | Wrap children in `<ModeProvider>` |
| `app/daily/page.tsx` | Reorder sections, rename Brain Dump → Fertile Ground, restyle, add context to task creation, persist forage order |
| `app/tasks/page.tsx` | Pass `?context=${mode}` to fetch, add context to new task form |
| `app/sprints/page.tsx` | Pass `?context=${mode}` to fetch |
| `app/focus/page.tsx` | Pass `?context=${mode}` to fetch |
| `app/time/page.tsx` | Pass `?context=${mode}` to fetch |
| `app/review/page.tsx` | Pass `?context=${mode}` to fetch |
| `app/api/tasks/route.ts` | Accept `context` on GET (filter) and POST (save) |
| `app/api/tasks/[id]/route.ts` | Accept `context` on PATCH |
| `app/globals.css` | Add `.personal-mode` block with CSS custom property overrides |
