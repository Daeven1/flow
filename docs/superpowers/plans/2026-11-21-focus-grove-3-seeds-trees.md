# Focus Grove, piece 3: seeds, berry bushes and trees — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ticking off tasks earns seeds; seeds buy better plants (a berry bush, a sapling); a sapling becomes a young tree and then a mature tree over later focus sessions spent "tending" it.

**Architecture:** Seed and species rules are pure functions in `lib/grove/`. The server owns the seed balance: a per-user "earned" counter that changes only when a task flips between not-done and done, minus the cost recorded on each focus session that bought a plant. A session either plants (species + spot, as now) or tends one existing tree (by id). The server ends it exactly as today, inside the same transaction: a kept tend raises the tree's stage, and a lost tend changes nothing. The 3D models gain a berry bush and a three-stage tree.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 on Supabase Postgres, Tailwind 3, Vitest, three.js 0.187 (already in use).

**Spec:** `docs/superpowers/specs/2026-11-19-focus-grove-design.md`. This plan covers build-order piece 3, the "Seeds and plants" section. Pieces 1 and 2 are live.

## Calls made in this plan (David can overrule)

- **Seeds come from ticking, not from tasks existing.** Each tick of a not-done task earns 1 seed, and un-ticking takes it back (spec). Deleting a finished task (the red x in The Gain) **keeps** its seed, so tidying up never costs anything.
- **Starting balance:** tasks finished since the grove went live (21 November 2026) count, so you start with the seeds you have already earned.
- **Costs:** wildflowers and fern stay free, a berry bush costs 2 and a sapling 3 (the spec's suggested values). Tending a tree is free. Seeds are spent when the session starts and are not returned if the plant dies (spec).
- **Trees:** one tree kind with three stages: sapling (planted in one session), then young tree, then mature tree, each reached by one more finished tending session (spec). A lost tending session leaves the tree exactly as it was.
- **Where you see seeds:** on the Focus page, as a count next to "N plants in your grove", and on each plant button when choosing a session. No changes to the Daily page.

## Global Constraints

- Work on branch `focus-grove-seeds`, cut from `main`. Never push to `main`, because pushing `main` deploys to production.
- Database changes are one SQL file. David runs it in the Supabase SQL Editor **before the branch is pushed**: previews share the production database, and the generated Prisma client selects new columns on every query of a model. Do not run `prisma db push` or `prisma migrate`. Every change is additive (new nullable or defaulted columns).
- Every API route keeps `export const runtime = 'nodejs';` and scopes every query to the id from `getUser()` (or the reminders API key's user).
- Seed changes happen only on a real flip: not-done → done is +1, done → not-done is −1, and anything else is 0, in every code path that ticks a task: `POST /api/tasks` with `done`, `PATCH /api/tasks/[id]`, and `PATCH /api/reminders/complete-task`.
- The balance shown is never below 0. A paid plant is accepted only if the balance covers its cost when the session starts.
- Only the plant being grown in a session can die. A tended tree never dies or shrinks.
- Sessions saved or pending from pieces 1–2 (with `plant: null` or `{ species, x, y }` and no tend) still load, sync and end exactly as now.
- three.js stays out of every page except `/focus` and `/grove-lab`.
- Honour `prefers-reduced-motion`, WCAG AA, keyboard use, and both light and dark themes. No `window.confirm`/`alert`. Copy is plain and kind.

## Review Focus

1. **A task ticked, un-ticked and ticked again** ends at +1 seed, not +3. (Task 1 `seedDelta` tests; Task 2 wiring.)
2. **Two tabs start paid sessions with seeds for only one:** the second is accepted without its plant and starts as a plain session, never with a negative balance. (Task 3.)
3. **The tree being tended is withered, already mature or gone by the time the session starts or ends:** the session still ends normally and nothing breaks. (Task 3 tests.)
4. **A mature tree is much taller than anything before:** the grove still frames without clipping at phone and laptop sizes. (Task 5.)
5. **The same session end retried** raises a tree's stage exactly once. (Task 3: the stage change sits behind the existing outcome claim.)

---

### Task 1: Species, costs, stages and seed rules

**Files:**
- Modify: `lib/grove/layout.ts`, `lib/grove/layout.test.ts`
- Create: `lib/grove/seeds.ts`, `lib/grove/seeds.test.ts`

**Interfaces — Produces:**

```ts
// layout.ts (changed)
export const SPECIES = ["WILDFLOWERS", "FERN", "BERRY_BUSH", "TREE"] as const;
export const COST: Record<Species, number> = { WILDFLOWERS: 0, FERN: 0, BERRY_BUSH: 2, TREE: 3 };
export const MAX_STAGE = 3;            // TREE: 1 sapling, 2 young tree, 3 mature tree; every other species is always 1
export type GrovePlant = { ...as now; stage: number };
export type PlantChoice = { species: Species; x: number; y: number; tendId?: string };
export function canTend(p: GrovePlant): boolean;   // TREE, ALIVE, stage < MAX_STAGE
export function parsePlantChoice(v: unknown): PlantChoice | null;  // as now, plus: an optional tendId that is a non-empty string up to 64 chars; with tendId the species must be TREE

// seeds.ts
export const SEEDS_SINCE = new Date("2026-11-21T00:00:00+08:00");
export function seedDelta(wasDone: boolean, isDone: boolean): -1 | 0 | 1;
export function balance(earned: number, spent: number): number;   // max(0, earned - spent)
export function costOf(choice: PlantChoice | null): number;        // 0 for null or any tendId; otherwise COST[species]
```

- [ ] **Step 1: Write failing tests.**

```ts
// seeds.test.ts
test("only a real flip changes seeds", () => {
  expect(seedDelta(false, true)).toBe(1);
  expect(seedDelta(true, false)).toBe(-1);
  expect(seedDelta(true, true)).toBe(0);
  expect(seedDelta(false, false)).toBe(0);
});
test("tick, untick, tick nets one seed", () => {
  expect(seedDelta(false, true) + seedDelta(true, false) + seedDelta(false, true)).toBe(1);
});
test("balance never goes below zero", () => {
  expect(balance(5, 3)).toBe(2);
  expect(balance(2, 5)).toBe(0);
});
test("costs", () => {
  expect(costOf(null)).toBe(0);
  expect(costOf({ species: "FERN", x: 0, y: 0 })).toBe(0);
  expect(costOf({ species: "BERRY_BUSH", x: 0, y: 0 })).toBe(2);
  expect(costOf({ species: "TREE", x: 0, y: 0 })).toBe(3);
  expect(costOf({ species: "TREE", x: 1, y: 1, tendId: "p1" })).toBe(0);
});
// layout.test.ts additions
test("plant choice with a tend id", () => {
  expect(parsePlantChoice({ species: "TREE", x: 1, y: 2, tendId: "abc" })).toEqual({ species: "TREE", x: 1, y: 2, tendId: "abc" });
  expect(parsePlantChoice({ species: "FERN", x: 1, y: 2, tendId: "abc" })).toBeNull();
  expect(parsePlantChoice({ species: "TREE", x: 1, y: 2, tendId: "" })).toBeNull();
  expect(parsePlantChoice({ species: "BERRY_BUSH", x: 0, y: 0 })).toEqual({ species: "BERRY_BUSH", x: 0, y: 0 });
});
test("only a living, unfinished tree can be tended", () => {
  const t = { id: "t", species: "TREE", x: 0, y: 0, status: "ALIVE", plantedAt: "", witheredAt: null, stage: 2 } as const;
  expect(canTend(t)).toBe(true);
  expect(canTend({ ...t, stage: 3 })).toBe(false);
  expect(canTend({ ...t, status: "WITHERED" })).toBe(false);
  expect(canTend({ ...t, species: "FERN", stage: 1 })).toBe(false);
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update every place that builds a `GrovePlant` in tests or code with `stage: 1` so that the types stay exact. The existing parse tests keep passing.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: pass and clean.
- [ ] **Step 5: Commit** `feat(grove): berry bush and tree species, costs, stages and seed rules`.

---

### Task 2: Seed balance in the database, earned on every tick

**Files:**
- Modify: `prisma/schema.prisma`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/reminders/complete-task/route.ts`, `app/api/grove/route.ts`
- Create: `prisma/migrations/20261122000000_add_seeds_and_tree_stages/migration.sql`, `lib/grove/seedStore.ts`

**Interfaces:**
- Consumes: `seedDelta`, `balance`, `SEEDS_SINCE`.
- Produces:
  - Schema: `UserSettings.seedsEarned Int?` (null = not counted yet); `FocusSession.plantCost Int @default(0)`; `FocusSession.tendPlantId String?`; `GrovePlant.stage Int @default(1)`.
  - SQL: the matching `ALTER TABLE` statements only, in the style of the earlier migration files. Note that `UserSettings` rows may not exist for every user.
  - `lib/grove/seedStore.ts` (server-only, takes a Prisma client or transaction client):
    - `addSeeds(db, userId, delta): Promise<void>`: does nothing for 0; otherwise first makes sure the counter is initialised (below), then increments it by `delta` atomically.
    - `seedBalance(db, userId): Promise<number>`: initialises if needed, then returns `balance(seedsEarned, sum of FocusSession.plantCost for the user)`.
    - Initialising: when the user's `UserSettings` row is missing or `seedsEarned` is null, set it to the number of the user's tasks with `done = true` and `doneAt >= SEEDS_SINCE`, creating the row with defaults if needed. It must be safe if two requests do this at once (an upsert, then an `updateMany ... where seedsEarned is null`).
  - `GET /api/grove` response becomes `{ plants: GrovePlant[] (each with stage), seeds: number }`.
- Wiring, keeping each route's current behaviour otherwise:
  - `POST /api/tasks` with `done: true`: `addSeeds(+1)` after the create.
  - `PATCH /api/tasks/[id]` with `done` in the body: read the task's current `done` first (scoped to the user), then after the update `addSeeds(seedDelta(before, after))`. The iOS Shortcuts API-key path counts as well.
  - `PATCH /api/reminders/complete-task`: `addSeeds(+1)` only when it actually marks a task done.
  - `DELETE` routes: no change, so a deleted finished task keeps its seed.

- [ ] **Step 1: Schema, SQL file and `npx prisma generate`** (no database connection).
- [ ] **Step 2: Implement `seedStore.ts`** and the wiring. Keep each route's response unchanged.
- [ ] **Step 3: Run** `npm test` and `npx tsc --noEmit`. Expected: pass and clean.
- [ ] **Step 4: Commit** `feat(grove): seeds earned by ticking tasks; balance in the grove API`.

---

### Task 3: Buying and tending at the start and end of a session

**Files:**
- Modify: `lib/focus/validate.ts` (+ test), `app/api/focus/sessions/route.ts`, `app/api/focus/sessions/[id]/route.ts`, `lib/grove/planting.ts` (+ test)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - POST: `parseStart` keeps accepting `plant` (now possibly with `tendId`). In one transaction the route works out what the plant becomes:
    - a paid species whose cost exceeds `seedBalance` is stored as no plant (`plantSpecies` null, `plantCost` 0);
    - a tend whose tree is not the user's, not ALIVE, not a TREE or at `MAX_STAGE` is stored as no plant;
    - otherwise it stores `plantSpecies`/`plantX`/`plantY` (for a tend, the tree's species and spot), `plantCost = costOf(choice)` and `tendPlantId`.
    The response gains `plantAccepted: boolean`. The session itself is always created.
  - PATCH (inside the existing claim, so a retry does nothing):
    - when `tendPlantId` is set and the outcome is COMPLETED/CLEARED, raise that tree's stage by 1 with `updateMany({ where: { id, userId, status: "ALIVE", stage: { lt: MAX_STAGE } }, data: { stage: { increment: 1 } } })`;
    - when `tendPlantId` is set, create no new plant for any outcome;
    - otherwise plant as today.
  - `planFor` gains a `tendPlantId: string | null` field on `PlantingSession` and returns null when it is set.

- [ ] **Step 1: Write failing tests.** `planning.test.ts`: a session with `tendPlantId` returns null for all four outcomes, and a berry-bush session plants a `BERRY_BUSH` exactly as wildflowers do. `validate.test.ts`: `parseStart` keeps a plant with `tendId`, and drops `{ species: "FERN", ..., tendId }` without rejecting the start.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** both routes as above.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: pass and clean.
- [ ] **Step 5: Commit** `feat(grove): sessions buy plants with seeds or tend a tree`.

---

### Task 4: Berry bush and tree models

**Files:**
- Modify: `lib/grove/models.ts`, `lib/grove/models.test.ts`

**Interfaces:**
- Produces: `buildPlant(species, seed, theme, stage = 1)`; `fullHeight(species, stage = 1)` with WILDFLOWERS 0.7, FERN 0.6, BERRY_BUSH 0.55, and TREE 0.8 / 1.3 / 1.9 for stages 1 / 2 / 3; `MAX_PLANT_HEIGHT` (the tallest of these, for framing).
- `setGrowth(t)` for `TREE` at stage s grows from the full shape of stage s − 1 to the full shape of stage s, so tending a young tree shows it growing into a mature one. Stage 1 starts from the existing seedling, as every other species does.

Look, the builder's craft within these limits: same low-poly flat-shaded style, seeded by `mulberry32`, no textures, each plant under ~400 triangles and a mature tree under ~700.
- Berry bush: a rounded clump of 3–5 faceted leaf masses with 6–10 small red berries that appear late (growth 0.7–1).
- Tree:
  - Stage 1 sapling: a thin trunk with a few leaf tufts.
  - Stage 2 young tree: a taller trunk with one or two faceted canopy blobs.
  - Stage 3 mature tree: a thicker trunk, 3–5 canopy blobs about 1.1 across (overhanging neighbouring spots is fine), and a few low branches.
  - Withering applies to stage 1 only, because only a sapling can be lost.
  - Bark is warm brown; canopy greens are deeper than the grass in both themes, with the same contrast rule as the seedling.

- [ ] **Step 1: Write failing tests:**
  - for each new species/stage, the growth-0 → growth-1 height rises and ends within 0.8–1.2 × `fullHeight(species, stage)`;
  - a TREE at stage 2, growth 0 is about as tall as a TREE at stage 1, growth 1 (within 10 %), and likewise for stages 3 and 2;
  - height never decreases over growth for seeds 1–10;
  - triangle budgets;
  - the existing tests are unchanged.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` and `npm run build`. Expected: pass, clean, built.
- [ ] **Step 5: Commit** `feat(grove): low-poly berry bush and a tree that grows in three stages`.

---

### Task 5: Drawing stages and tending in the grove

**Files:**
- Modify: `components/grove/GroveCanvas.tsx`, `components/grove/Grove.tsx`, `app/grove-lab/GroveLab.tsx`

**Interfaces:**
- `Growing` gains `stage: number` (the stage being grown into; 1 for new plants) and optional `tendId`.
- `GroveProps` gains `tendable?: boolean` and `onPickTree?: (plantId: string) => void`.
- Saved plants are drawn at their `stage` with full growth (withered at `WITHERED_GROWTH`). A plant's key includes its stage, so a stage change rebuilds that one model.
- When `growing.tendId` matches a saved tree, that tree is drawn as the growing plant (stage = its stage + 1, growing with progress), and its resting copy is hidden. A lost tend shows the tree back at its old stage with no wither animation.
- When `tendable`, trees for which `canTend` holds get the soft warm-yellow ring, and a tap or click on one calls `onPickTree`. The selected one gets the marker.
- Framing uses `MAX_PLANT_HEIGHT`.
- The lab gains: species buttons for all four kinds, a stage selector for trees, a "Tend" toggle, and a few trees at each stage among the kept plants.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit` and `npm run build`. Expected: clean, with three.js still only in the lazy chunk.
- [ ] **Step 3: Controller look:** check `/grove-lab` with every species and stage, a tend in progress, kept and lost outcomes, and the mature-tree framing at a wide and a tall box. Visual fixes go back to the implementer.
- [ ] **Step 4: Commit** `feat(grove): draw tree stages and tending in the grove`.

---

### Task 6: Seeds and tending on the Focus page

**Files:**
- Modify: `lib/grove/useGrove.ts` (+ test), `app/focus/page.tsx`, `components/focus/SessionSetup.tsx`, `SessionView.tsx`, `SessionEnd.tsx`, `components/focus/groveText.tsx`, `lib/grove/pending.ts` (+ test)

**Interfaces:**
- `useGrove()` adds `seeds: number | null` (null until loaded), parsed from the response and kept on a failed refresh.

**Copy, used verbatim:**
- Rest screen: next to "{n} plants in your grove", add " · {s} seeds" (`1 seed` singular).
- Setup, "What to grow": four buttons, each with a cost line under the name: "Free", "2 seeds", "3 seeds". When the balance is short, the button is disabled and the cost line reads "Needs {k} more". A fifth option, "Tend a tree", appears only when a tendable tree exists; choosing it switches the grove to `tendable` with the hint "Tap a sapling or young tree to tend it."
- Session label and line for a tend: "Your tree is growing." For a berry bush: "Your berry bush is growing."
- End screen, kept tend: append " Your tree grew." to the existing message. Lost tend: append " Your tree is just as it was."

**Behaviour:**
- `useFocusSession.start` sends the choice (with `tendId` when tending).
- If the POST answers `plantAccepted: false`, the session view shows the plain bar plus the line "There weren't enough seeds for that plant, so this is a plain session." For a tend, the line is "That tree can't be tended right now, so this is a plain session." The session itself carries on.
- The temporary-plant rule (`pending.ts`) treats a tend as "raise that tree's stage" rather than "add a plant", and drops the temporary change once a refresh shows the higher stage.
- `GrovePlant.stage` flows through `useGrove`'s parser (rows without a stage default to 1).

- [ ] **Step 1: Write failing tests** for the `useGrove` parser (seeds read; stage defaults to 1) and for the pending tend rule.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `npm test`, `npx tsc --noEmit` and `npm run build`. Expected: clean.
- [ ] **Step 4: Commit** `feat(grove): seeds, berry bushes and tending on the Focus page`.

---

### Task 7: Database step and live check

- [ ] **Step 1:** Stop, and give David the SQL file to run in the Supabase SQL Editor. It adds four columns, so the live app is unaffected. Wait for his confirmation, then check it took: the branch's preview must be able to read `GET /api/grove` with `seeds` before anything else is tested.
- [ ] **Step 2:** With his go-ahead, push `focus-grove-seeds` and check on the branch alias in Brave. Use throwaway tasks and delete them afterwards, noting that every plant made on the preview lands in David's real grove.
  - Ticking a task raises the seed count by 1; un-ticking lowers it; deleting a ticked task leaves it.
  - A berry bush is bought when seeds allow, and its button is disabled with "Needs k more" when they don't.
  - A sapling is planted.
  - Tending it once to a young tree (to save time, this check may use a 20-minute session ended early by clearing a one-task list).
  - A lost tend leaves the tree as it was.
  - Dark mode, and the phone-size frame.
- [ ] **Step 3:** Report to David. Merging to `main` is his call. Update the Obsidian note named in `CLAUDE.md`.
