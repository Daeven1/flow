# Focus Grove, piece 2: the 3D grove and growing plants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the timer's plain progress bar with a small low-poly 3D grove: each focus session grows one plant on a spot David chooses, finished sessions keep the plant, lost sessions leave a withered stalk, and the grove is visible on the Focus page between sessions.

**Architecture:** Planting rules and grid maths are pure functions in `lib/grove/layout.ts`. Plant and island shapes are built in code by `lib/grove/models.ts` (three.js geometry, testable without a browser). One client component, `GroveCanvas`, owns the WebGL scene and is loaded only on the Focus page. A session carries its plant choice; the server creates the kept or withered plant inside the same transaction that ends the session, so the existing offline sync and retry logic covers plants for free.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 on Supabase Postgres, Tailwind 3, Vitest, plus `three` (new runtime dependency, used directly, no React wrapper) and `@types/three` (dev).

**Spec:** `docs/superpowers/specs/2026-11-19-focus-grove-design.md` (this plan covers build-order piece 2 only; piece 1 is live).

## Calls made in this plan (David can overrule)

- **Plain three.js, no React wrapper.** The scene is small and driven by one number; this avoids a second library tied to the React version.
- **Two free plants now: wildflowers and a fern.** Berry bushes, saplings, trees and seed costs arrive with piece 3, so nothing given now is taken away later.
- **A spot is suggested for you** (the free spot nearest the middle); tapping another spot is optional. Fewer decisions before focusing.
- **The session screen is rearranged** so nothing needs scrolling: grove beside the task note on a laptop, grove above a shorter note on a phone. This also fixes the live problem where "Done" and "Give up" sit below the screen.
- **A grove lab page** exists in development only, so the scene can be looked at without the database.

## Global Constraints

- Work on branch `focus-grove-3d`, cut from `main`. Never push to `main`; pushing `main` deploys to production.
- Database changes are delivered as one SQL file for David to run in the Supabase SQL Editor before any deployment. Do not run `prisma db push` or `prisma migrate`. Every change is additive (new table, new nullable columns) so the live app keeps working before and after.
- Every API route starts with `export const runtime = 'nodejs';` and scopes every query to the id from `getUser()`.
- three.js is imported only by files under `lib/grove/models.ts` and `components/grove/`, and reaches the browser only through a `next/dynamic` import with `ssr: false` on the Focus page (and the lab page). No other page's bundle may grow.
- Only the plant being grown in a session can die. Nothing already in the grove is ever removed or changed by a failed session.
- A withered plant stays on its spot until the end of the next day (the user's local day), then disappears and frees the spot.
- Finishing the list early: the plant quickly grows the rest of the way and is kept.
- If WebGL is unavailable the timer must still work, showing the piece-1 progress bar and the line "This device can't draw the grove, so here's a plain timer."
- Honour `prefers-reduced-motion` (no sway, no bounce, growth still shown as size), WCAG AA for all text and controls, keyboard operability, light (Calm Pool `#E0EFFE`) and dark (Midnight Navy `#0D1B2E`) themes.
- A phone left on for 30 minutes: cap device pixel ratio at 2, render at most 30 frames a second, stop rendering while the page is hidden.
- At 1470×800 and at 390×844 the running session shows the grove, the time left, the current task, "Done" and "Give up" without scrolling.
- No `window.confirm` / `alert`. User-facing copy is plain and kind.

## Review Focus

1. **A session started before this piece shipped (no plant) ends normally** and creates no plant; old saved sessions in localStorage still parse. (Task 3 tests.)
2. **The same session end retried or sent twice creates exactly one plant.** (Task 2: unique `sessionId`; test on the pure planner.)
3. **The chosen spot was taken meanwhile (second device):** the plant lands on the nearest free spot instead of failing. (Task 1 `nearestFree` tests; Task 2.)
4. **The grove is full:** the grid widens and existing plants keep their places. (Task 1 `gridSize` / `spots` tests.)
5. **The tab is hidden for 20 minutes, then shown:** the plant jumps to the right size without a long catch-up animation, and no frames were rendered while hidden. (Task 5.)

---

### Task 1: Grove layout and rules

**Files:**
- Create: `lib/grove/layout.ts`, `lib/grove/layout.test.ts`

**Interfaces — Produces:**

```ts
export const SPECIES = ["WILDFLOWERS", "FERN"] as const;
export type Species = (typeof SPECIES)[number];
export type PlantStatus = "ALIVE" | "WITHERED";
export type Spot = { x: number; y: number };
export type GrovePlant = {
  id: string; species: Species; x: number; y: number;
  status: PlantStatus; plantedAt: string; witheredAt: string | null;   // ISO strings
};
export type PlantChoice = { species: Species; x: number; y: number };

export function isSpecies(v: unknown): v is Species;
export function gridSize(plantCount: number): number;
export function spots(n: number): Spot[];
export function freeSpots(n: number, plants: Spot[]): Spot[];
export function defaultSpot(n: number, plants: Spot[]): Spot | null;
export function nearestFree(n: number, plants: Spot[], want: Spot): Spot | null;
export function witherExpiry(witheredAt: Date, tzOffsetMin: number): Date;
export function parsePlantChoice(v: unknown): PlantChoice | null;
```

Rules:
- `gridSize`: the smallest even `n ≥ 6` with `plantCount <= n * n - 6` (so 0–30 → 6, 31–58 → 8, 59–94 → 10).
- `spots(n)`: every integer pair with `x` and `y` in `[-n/2, n/2 - 1]`, so a wider grid contains every spot of a narrower one.
- `defaultSpot` / `nearestFree`: the free spot with the smallest squared distance to the target (`{x: -0.5, y: -0.5}` for `defaultSpot`); ties broken by smaller `y`, then smaller `x`; `null` when none is free. `nearestFree` returns `want` itself when it is free and inside the grid.
- `witherExpiry`: the instant the plant disappears, which is local midnight at the start of the day after next. `tzOffsetMin` is what `Date.prototype.getTimezoneOffset()` returns (Shanghai is `-480`).
- `parsePlantChoice`: object with a valid species and integer `x`, `y` each in `[-20, 19]`; otherwise `null`.

- [ ] **Step 1: Write the failing tests** `lib/grove/layout.test.ts`:

```ts
test("grid widens only when nearly full", () => {
  expect([0, 30, 31, 58, 59].map(gridSize)).toEqual([6, 6, 8, 8, 10]);
});
test("a wider grid keeps every spot of the narrower one", () => {
  const six = spots(6), eight = spots(8);
  expect(six).toHaveLength(36);
  expect(eight).toHaveLength(64);
  expect(six.every((s) => eight.some((e) => e.x === s.x && e.y === s.y))).toBe(true);
  expect(six).toContainEqual({ x: -3, y: -3 });
  expect(six).toContainEqual({ x: 2, y: 2 });
});
test("default spot is the free one nearest the middle, ties by y then x", () => {
  expect(defaultSpot(6, [])).toEqual({ x: -1, y: -1 });
  expect(defaultSpot(6, [{ x: -1, y: -1 }])).toEqual({ x: 0, y: -1 });
  expect(defaultSpot(6, spots(6))).toBeNull();
});
test("nearestFree keeps a free wish and moves a taken one", () => {
  expect(nearestFree(6, [], { x: 2, y: 2 })).toEqual({ x: 2, y: 2 });
  expect(nearestFree(6, [{ x: 2, y: 2 }], { x: 2, y: 2 })).toEqual({ x: 2, y: 1 });
  expect(nearestFree(6, [], { x: 9, y: 9 })).toEqual({ x: 2, y: 2 });
});
test("a withered plant lasts until the end of the next local day", () => {
  expect(witherExpiry(new Date("2026-11-19T02:00:00.000Z"), -480).toISOString()).toBe("2026-11-20T16:00:00.000Z");
  expect(witherExpiry(new Date("2026-11-19T17:00:00.000Z"), -480).toISOString()).toBe("2026-11-21T16:00:00.000Z");
  expect(witherExpiry(new Date("2026-11-19T02:00:00.000Z"), 0).toISOString()).toBe("2026-11-21T00:00:00.000Z");
});
test("plant choice parsing", () => {
  expect(parsePlantChoice({ species: "FERN", x: -3, y: 2 })).toEqual({ species: "FERN", x: -3, y: 2 });
  expect(parsePlantChoice({ species: "OAK", x: 0, y: 0 })).toBeNull();
  expect(parsePlantChoice({ species: "FERN", x: 0.5, y: 0 })).toBeNull();
  expect(parsePlantChoice({ species: "FERN", x: 20, y: 0 })).toBeNull();
  expect(parsePlantChoice(null)).toBeNull();
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, `./layout` not found.
- [ ] **Step 3: Implement `lib/grove/layout.ts`** to the interface and rules. No imports from three, React or the DOM.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(grove): planting grid and wither rules with tests`.

---

### Task 2: Plants in the database and API

**Files:**
- Modify: `prisma/schema.prisma`, `lib/focus/validate.ts`, `lib/focus/validate.test.ts`, `app/api/focus/sessions/route.ts`, `app/api/focus/sessions/[id]/route.ts`
- Create: `prisma/migrations/20261120000000_add_grove_plants/migration.sql`, `lib/grove/planting.ts`, `lib/grove/planting.test.ts`, `app/api/grove/route.ts`

**Interfaces:**
- Consumes: everything from Task 1; `Outcome` from `lib/focus/session.ts`.
- Produces:
  - `POST /api/focus/sessions` additionally accepts optional `plant: PlantChoice | null`; `StartInput` gains `plant: PlantChoice | null` (absent or invalid → `null`, never a 400).
  - `PATCH /api/focus/sessions/[id]`: unchanged body; now also creates the plant.
  - `GET /api/grove?tz=<minutes>` → `200 { plants: GrovePlant[] }` (401 unsigned). `tz` is the browser's `getTimezoneOffset()`, an integer clamped to `[-840, 840]`, default 0.
  - `planFor(session, outcome, endedAt, occupied): NewPlant | null` in `lib/grove/planting.ts`, where `session` is `{ id; plantSpecies: string | null; plantX: number | null; plantY: number | null }`, `occupied: Spot[]`, and `NewPlant = { sessionId; species; x; y; status: PlantStatus; plantedAt: Date; witheredAt: Date | null }`.

Schema:

```prisma
model GrovePlant {
  id         String    @id @default(cuid())
  userId     String
  species    String
  x          Int
  y          Int
  status     String    @default("ALIVE")
  plantedAt  DateTime  @default(now())
  witheredAt DateTime?
  sessionId  String?   @unique

  @@index([userId])
}
```

and on `FocusSession`: `plantSpecies String?`, `plantX Int?`, `plantY Int?`.

SQL file: `CREATE TABLE "GrovePlant"` (types as Prisma generates them, `"GrovePlant_pkey"`, unique index `"GrovePlant_sessionId_key"`, index `"GrovePlant_userId_idx"`), `ALTER TABLE "GrovePlant" ENABLE ROW LEVEL SECURITY;`, and `ALTER TABLE "FocusSession" ADD COLUMN "plantSpecies" TEXT, ADD COLUMN "plantX" INTEGER, ADD COLUMN "plantY" INTEGER;`. Match the style of `prisma/migrations/20261119000000_add_focus_session/migration.sql`.

`planFor` rules: returns `null` when `plantSpecies` is not a valid species or `plantX`/`plantY` is null. Otherwise the spot is `nearestFree(gridSize(occupied.length + 1), occupied, {x, y})` (if that is `null`, widen with `gridSize(occupied.length + 7)` and try again). `COMPLETED` and `CLEARED` → `status: "ALIVE"`, `witheredAt: null`; `GAVE_UP` and `LEFT` → `status: "WITHERED"`, `witheredAt: endedAt`. `plantedAt` is `endedAt`.

PATCH: inside the existing transaction, after the session's outcome has been claimed, load the user's plants that have not expired, call `planFor`, and create the row. The time-log behaviour is unchanged. A unique-constraint failure on `sessionId` is treated as already done.

GET `/api/grove`: delete this user's `WITHERED` plants whose `witherExpiry(witheredAt, tz)` is in the past, then return the rest ordered by `plantedAt`.

- [ ] **Step 1: Write failing tests.** In `lib/grove/planting.test.ts`:

```ts
const S = { id: "s1", plantSpecies: "FERN", plantX: 0, plantY: 0 };
const END = new Date("2026-11-20T03:00:00.000Z");
test("a finished session keeps its plant", () => {
  expect(planFor(S, "COMPLETED", END, [])).toEqual(
    { sessionId: "s1", species: "FERN", x: 0, y: 0, status: "ALIVE", plantedAt: END, witheredAt: null });
  expect(planFor(S, "CLEARED", END, [])?.status).toBe("ALIVE");
});
test("a lost session leaves a withered plant", () => {
  expect(planFor(S, "LEFT", END, [])).toMatchObject({ status: "WITHERED", witheredAt: END });
  expect(planFor(S, "GAVE_UP", END, [])?.status).toBe("WITHERED");
});
test("a taken spot moves to the nearest free one", () => {
  expect(planFor(S, "COMPLETED", END, [{ x: 0, y: 0 }])).toMatchObject({ x: 0, y: -1 });
});
test("a full grid widens instead of failing", () => {
  const p = planFor(S, "COMPLETED", END, spots(6));
  expect(p).not.toBeNull();
  expect(spots(6).some((s) => s.x === p!.x && s.y === p!.y)).toBe(false);
});
test("a session without a plant makes none", () => {
  expect(planFor({ id: "s2", plantSpecies: null, plantX: null, plantY: null }, "COMPLETED", END, [])).toBeNull();
  expect(planFor({ ...S, plantSpecies: "OAK" }, "COMPLETED", END, [])).toBeNull();
});
```

In `lib/focus/validate.test.ts` add: `parseStart` with `plant: { species: "FERN", x: 1, y: -2 }` returns that plant; with no `plant`, with `plant: null` and with `plant: { species: "OAK", x: 0, y: 0 }` it returns `plant: null` and is still accepted. Update the existing `parseStart` expectation to include `plant: null`.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `planting.ts` and the `validate.ts` change. Run `npm test`. Expected: pass.
- [ ] **Step 4: Schema, SQL file, routes.** `npx prisma generate`. Store the plant choice on `FocusSession` in the POST route.
- [ ] **Step 5: Run** `npx tsc --noEmit` and `npm test`. Expected: clean, all pass.
- [ ] **Step 6: Commit** `feat(grove): plants table, grove API, plant created when a session ends`.

---

### Task 3: A session carries its plant

**Files:**
- Modify: `lib/focus/session.ts`, `lib/focus/storage.ts`, `lib/focus/storage.test.ts`, `lib/focus/useFocusSession.ts`

**Interfaces:**
- Consumes: `PlantChoice`, `parsePlantChoice` from Task 1.
- Produces: `SavedSession` gains `plant: PlantChoice | null`. `FocusSessionApi.start` input becomes `{ plannedMinutes; rule; taskIds; plant: PlantChoice | null }`. The start POST body includes `plant`.

`parseSaved` treats a missing `plant` key as `null` (sessions saved by piece 1 must still load) and an invalid one as `null`; it never rejects a session because of its plant.

- [ ] **Step 1: Write failing tests** in `storage.test.ts`: a valid saved session without a `plant` key parses with `plant: null`; one with `plant: { species: "WILDFLOWERS", x: -1, y: -1 }` round-trips; one with `plant: { species: "OAK", x: 0, y: 0 }` parses with `plant: null`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update the test helper(s) that build a `SavedSession` to include `plant: null`. Pending-list entries carry their plant unchanged.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` (the Focus page's `start` call must be updated to pass `plant: null` for now so the build stays green). Expected: clean.
- [ ] **Step 5: Commit** `feat(grove): a focus session carries its plant choice`.

---

### Task 4: Plant and island shapes

**Files:**
- Modify: `package.json` (add `three`, dev `@types/three`)
- Create: `lib/grove/models.ts`, `lib/grove/models.test.ts`

**Interfaces:**
- Consumes: `Species`, `Spot` from Task 1.
- Produces:

```ts
import * as THREE from "three";
export type Theme = "light" | "dark";
export type PlantModel = {
  group: THREE.Group;
  setGrowth(t: number): void;        // 0 = just planted, 1 = full size; clamps
  setWithered(w: number): void;      // 0 = healthy, 1 = fully withered; clamps
  dispose(): void;                   // disposes every geometry and material it created
};
export function buildPlant(species: Species, seed: number, theme: Theme): PlantModel;
export function buildIsland(n: number, theme: Theme): { group: THREE.Group; dispose(): void };
export function spotToWorld(spot: Spot): THREE.Vector3;   // spots are 1 unit apart; {x:-0.5,y:-0.5} maps to the origin; grid y maps to world z
export function fullHeight(species: Species): number;     // WILDFLOWERS 0.5, FERN 0.45
export function mulberry32(seed: number): () => number;   // the seeded random used for every shape
```

Look, which is the builder's craft within these limits: low-poly, every material `flatShading: true`, no textures, no external model files. Wildflowers: a clump of 5–7 thin stems with small faceted blooms in two or three colours. Fern: 6–8 arching fronds of flat tapered leaflets. Growth is staged as well as scaled: stems rise first (t 0–0.5), leaves or fronds unfold (0.3–0.8), blooms or frond tips open last (0.7–1). Withering droops the stems, shrinks blooms and shifts colours toward straw brown. The island is a low faceted mound of grass with a darker soil rim, slightly irregular (seeded by `n`), big enough for the `n`×`n` grid with a margin; it has no water. All randomness comes from `mulberry32(seed)` so the same plant always looks the same.

- [ ] **Step 1: Install** `npm i three` and `npm i -D @types/three`.
- [ ] **Step 2: Write failing tests** `lib/grove/models.test.ts` (Vitest node environment; three's geometry classes need no browser):

```ts
const height = (m: PlantModel) => new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()).y;
test.each(SPECIES)("%s grows from almost nothing to its full height", (sp) => {
  const m = buildPlant(sp, 7, "light");
  m.setGrowth(0); const h0 = height(m);
  m.setGrowth(0.5); const h5 = height(m);
  m.setGrowth(1); const h1 = height(m);
  expect(h0).toBeLessThan(0.1 * fullHeight(sp));
  expect(h5).toBeGreaterThan(h0);
  expect(h1).toBeGreaterThan(h5);
  expect(h1).toBeGreaterThan(0.8 * fullHeight(sp));
  expect(h1).toBeLessThan(1.2 * fullHeight(sp));
});
test("the same seed makes the same plant, another seed a different one", () => {
  const count = (seed: number) => { let n = 0; const m = buildPlant("WILDFLOWERS", seed, "light"); m.setGrowth(1);
    m.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) n += (o as THREE.Mesh).geometry.attributes.position.count; }); return n; };
  expect(count(3)).toBe(count(3));
  const shape = (seed: number) => { const m = buildPlant("WILDFLOWERS", seed, "light"); m.setGrowth(1); return new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3()).toArray().join(","); };
  expect(shape(3)).not.toBe(shape(4));
});
test("every material is flat shaded", () => {
  for (const sp of SPECIES) buildPlant(sp, 1, "dark").group.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat) expect(mat.flatShading).toBe(true);
  });
});
test("withering lowers the plant", () => {
  const m = buildPlant("FERN", 2, "light"); m.setGrowth(1); const up = height(m);
  m.setWithered(1); expect(height(m)).toBeLessThan(up);
});
test("spots map to a centred unit grid", () => {
  expect(spotToWorld({ x: -1, y: -1 }).toArray()).toEqual([-0.5, 0, -0.5]);
  expect(spotToWorld({ x: 2, y: 0 }).toArray()).toEqual([2.5, 0, 0.5]);
});
test("dispose frees what the plant made", () => {
  const m = buildPlant("FERN", 5, "light"); const spies: ReturnType<typeof vi.spyOn>[] = [];
  m.group.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) spies.push(vi.spyOn(g, "dispose")); });
  m.dispose(); expect(spies.length).toBeGreaterThan(0); spies.forEach((s) => expect(s).toHaveBeenCalled());
});
```

- [ ] **Step 3: Run** `npm test`. Expected: FAIL, `./models` not found.
- [ ] **Step 4: Implement `lib/grove/models.ts`.** Keep each plant under about 400 triangles.
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit`. Expected: pass, clean.
- [ ] **Step 6: Commit** `feat(grove): low-poly wildflowers, fern and island built in code`.

---

### Task 5: The grove canvas and the lab page

**Files:**
- Create: `components/grove/GroveCanvas.tsx`, `components/grove/Grove.tsx`, `lib/grove/tween.ts`, `lib/grove/tween.test.ts`, `app/grove-lab/page.tsx`
- Modify: `proxy.ts` (let `/grove-lab` through without sign-in when `process.env.NODE_ENV !== "production"` only)

**Interfaces:**
- Consumes: Tasks 1 and 4; `Outcome` from `lib/focus/session.ts`.
- Produces:

```ts
// components/grove/Grove.tsx — the only thing pages import. Loads GroveCanvas with next/dynamic({ ssr: false }).
export type Growing = { species: Species; spot: Spot; progress: number; outcome: Outcome | null };
export type GroveProps = {
  plants: GrovePlant[];
  growing?: Growing | null;
  pickable?: boolean;                 // show free spots and let one be chosen
  selectedSpot?: Spot | null;
  onPickSpot?: (spot: Spot) => void;
  label: string;                      // accessible name, e.g. "Your grove: 12 plants"
  className?: string;                 // sizes the box; the canvas fills it
  fallback?: React.ReactNode;         // shown instead when WebGL is unavailable
};
export function Grove(props: GroveProps): JSX.Element;

// lib/grove/tween.ts
export function approach(current: number, target: number, dtMs: number, halfLifeMs: number): number;
export function shownGrowth(growing: { progress: number; outcome: Outcome | null }): { growth: number; withered: number };
```

`approach` moves `current` toward `target` exponentially (half the remaining gap every `halfLifeMs`) and snaps when the gap is under 0.001 **or when `dtMs` is over 2000** (a hidden tab coming back must not replay a long animation). `shownGrowth`: no outcome → `{ growth: progress, withered: 0 }`; `COMPLETED` or `CLEARED` → `{ growth: 1, withered: 0 }`; `GAVE_UP` or `LEFT` → `{ growth: progress, withered: 1 }`.

`GroveCanvas` behaviour:
- One `WebGLRenderer` (`alpha: true`, `antialias: true`, pixel ratio `min(devicePixelRatio, 2)`), a fixed three-quarter view from above, a hemisphere light plus one directional light, theme taken from `document.documentElement.classList.contains("dark")` and watched for changes. Rebuilds the island when `gridSize(plants.length + (growing ? 1 : 0))` changes.
- Kept plants at full growth, withered ones withered, each seeded by a hash of its id. The growing plant is seeded by a hash of its spot and species and follows `shownGrowth` through `approach` (half-life 600 ms). When an outcome arrives: kept → a single small bounce; lost → droops over about 1.5 s.
- Drag (mouse or one finger) turns the grove about its vertical axis only; no zoom, no pan; the page still scrolls when a touch moves mostly vertically. Arrow-left/right turn it when the canvas wrapper is focused.
- `pickable`: free spots show as soft discs, the selected one is highlighted with a seedling marker; a tap or click (not a drag) on a free spot calls `onPickSpot`.
- Rendering: at most 30 frames a second, only while something is changing (growing, tweening, dragging, sway); idle sway renders at about 10 a second; nothing renders while `document.hidden` or when the canvas is off-screen; with reduced motion there is no sway or bounce and the scene renders only on change.
- The wrapper is `role="img"` with `aria-label={label}`. If creating the WebGL context throws or the context is lost for good, `Grove` shows `fallback`.
- On unmount: cancel the loop, remove listeners and observers, dispose every model, the island and the renderer.

`app/grove-lab/page.tsx`: returns `notFound()` when `process.env.NODE_ENV === "production"`. Otherwise a client page with a `Grove` box and controls: number of kept plants (0–70, generated on `spots` in a fixed order with alternating species and a few withered), a growth slider 0–100 %, species toggle, outcome buttons (none / completed / gave up), a `pickable` toggle, and a dark-theme toggle that flips the `dark` class on `<html>`.

- [ ] **Step 1: Write failing tests** `lib/grove/tween.test.ts`:

```ts
test("approach halves the gap each half-life and snaps when close or after a long pause", () => {
  expect(approach(0, 1, 600, 600)).toBeCloseTo(0.5);
  expect(approach(0.5, 1, 600, 600)).toBeCloseTo(0.75);
  expect(approach(0.9995, 1, 16, 600)).toBe(1);
  expect(approach(0, 1, 2001, 600)).toBe(1);
  expect(approach(0.3, 0.3, 16, 600)).toBe(0.3);
});
test("what the growing plant shows", () => {
  expect(shownGrowth({ progress: 0.4, outcome: null })).toEqual({ growth: 0.4, withered: 0 });
  expect(shownGrowth({ progress: 0.4, outcome: "CLEARED" })).toEqual({ growth: 1, withered: 0 });
  expect(shownGrowth({ progress: 1, outcome: "COMPLETED" })).toEqual({ growth: 1, withered: 0 });
  expect(shownGrowth({ progress: 0.4, outcome: "LEFT" })).toEqual({ growth: 0.4, withered: 1 });
  expect(shownGrowth({ progress: 0.4, outcome: "GAVE_UP" })).toEqual({ growth: 0.4, withered: 1 });
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `tween.ts`, `GroveCanvas.tsx`, `Grove.tsx`, the lab page and the `proxy.ts` exception.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run build`. Expected: clean; the build output shows three only in the `/focus` and `/grove-lab` chunks.
- [ ] **Step 5: Look at it.** Start the dev server and open `/grove-lab`. Check and screenshot: empty island; 12 and 40 plants (grid widened, earlier plants unmoved); growth slider at 0, 50 and 100 %; completed and gave-up outcomes; pickable spots; dark theme; a 390-px-wide window. Fix what looks wrong (clipping, plants off the island, unreadable in dark).
- [ ] **Step 6: Commit** `feat(grove): 3D grove canvas with growth, picking and a dev lab page`.

---

### Task 6: The grove on the Focus page

**Files:**
- Create: `lib/grove/useGrove.ts`
- Modify: `app/focus/page.tsx`, `components/focus/SessionSetup.tsx`, `components/focus/SessionView.tsx`, `components/focus/SessionEnd.tsx`, `components/StickyPile.tsx`

**Interfaces:**
- Consumes: `Grove`, `Growing`; Task 1 functions; the hook's new `start` input.
- Produces: `useGrove(): { plants: GrovePlant[]; status: "loading" | "loaded" | "failed"; refresh(): void }` (fetches `/api/grove?tz=${new Date().getTimezoneOffset()}`, validates the response is an array of plants, keeps the last good list on a failed refresh).

Screens:
- **No session:** a `Grove` box (about 280 px tall) above the queue builder with the line "{n} plants in your grove" (or "Your grove is ready for its first plant." when empty). While plants are loading the box shows the bare island.
- **`SessionSetup`:** gains "What to grow" (two buttons, Wildflowers preselected, Fern; `aria-pressed`) and a `Grove` with `pickable`, `selectedSpot` preset to `defaultSpot(...)`, and the line "A spot is picked for you. Tap another to move it." `onStart` now passes `plant`. If the grove failed to load, a session can still start with `plant: null`.
- **`SessionView`:** the `Grove` shows the kept plants plus `growing` built from the session's plant and `progress(session, now)`. A session with `plant: null` shows the piece-1 bar instead. Layout: at `lg` and wider, grove on the left and the task note with its buttons on the right; below `lg`, grove on top (about 38 vh) and the note below it. `StickyPile` gets an optional `compact` prop that drops the square shape (the note is as tall as its content, min 140 px) and is used here. The time left sits under the grove. The whole view fits the heights in Global Constraints.
- **`SessionEnd`:** shows the `Grove` with `growing.outcome` set, above the existing message. Kept: message unchanged. Lost: message unchanged. "New session" also calls `useGrove().refresh()`.
- The WebGL `fallback` everywhere during a session is the piece-1 bar plus the line from Global Constraints; outside a session the grove box is simply omitted.

- [ ] **Step 1: Implement `useGrove`**, then the four screens and the `StickyPile` prop.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npm run build`. Expected: clean.
- [ ] **Step 3: Self-walk by reading:** a session saved by piece 1 (no plant) open on load; grove fetch failing; WebGL missing; phone width.
- [ ] **Step 4: Commit** `feat(grove): grow a plant during a focus session; grove on the Focus page`.

---

### Task 7: Database step and live check

- [ ] **Step 1:** Stop and give David `prisma/migrations/20261120000000_add_grove_plants/migration.sql` to run in the Supabase SQL Editor. It adds one empty table and three empty columns; the live app is unaffected. Wait for his confirmation.
- [ ] **Step 2:** With his go-ahead, push branch `focus-grove-3d` (a preview, not production).
- [ ] **Step 3:** On the preview in David's browser (Brave), with throwaway tasks that are deleted afterwards: plant wildflowers on the suggested spot and clear the list (plant kept, still there after reload and on the rest screen); plant a fern on a chosen spot and give up (withered stalk on that spot); reload mid-session (plant at the right size); check 1470×800 and 390×844 need no scrolling; check dark theme; confirm `/daily` loads no three.js.
- [ ] **Step 4:** Report to David with screenshots, including anything not checked (real phone, battery over 30 minutes). Merging to `main` is his call. Update the Obsidian note named in `CLAUDE.md`.
