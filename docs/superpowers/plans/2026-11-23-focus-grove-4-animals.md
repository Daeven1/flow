# Focus Grove, piece 4: animals move in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Butterflies, bees, small birds and squirrels appear in the grove once the planting gives them a home. They move about gently, and a short line on the Focus page greets each newcomer.

**Architecture:** Which animals live in the grove is worked out from the saved plants by a pure function (`lib/grove/habitat.ts`), so nothing new is stored on the server and no database change is needed. Animals are low-poly models built in code (`lib/grove/animals.ts`), each with an allocation-free `update(timeMs)` that moves it around a home spot such as a flower, a bush or a tree's canopy. The grove canvas adds them as another layer. The Focus page compares today's animals with the ones this device has already greeted, so it can say who is new.

**Tech Stack:** Next.js 16, React 18, three.js 0.187 (already in use), Vitest. No new dependencies and no SQL.

**Spec:** `docs/superpowers/specs/2026-11-19-focus-grove-design.md`, the "Animals" section. Pieces 1–3 are live.

## Calls made in this plan (David can overrule)

- **Animals are built in code, not taken from a model pack.** The design said ready-made models for animals. Since then every plant has been built in code in one low-poly style, and that worked well. Code-built animals match that style, need no downloads or licences, keep the page small, and are easy to animate (wings flap, tails flick). The cost is that a squirrel will look stylised rather than lifelike.
- **Who moves in, and when** (all counts use living plants only; withered ones never count):

  | Animal | Arrives when | How many |
  |---|---|---|
  | Butterflies | at least 1 wildflower clump or berry bush | 1 per 2 of those, up to 4 |
  | Bees | at least 2 wildflower clumps or berry bushes | 1, or 2 once there are 5 |
  | Small birds | at least 2 berry bushes and 1 young or mature tree | 1, plus 1 per 2 more berry bushes, up to 3; plus 2 more once there are 2 mature trees (up to 5) |
  | Squirrels | a mature tree | 1 per mature tree, up to 2 |

- **Animals never leave because of a lost session.** A lost session only adds a withered plant and never removes a living one, so the counts can't drop.
- **A greeting for newcomers:** when you open the Focus page and a new animal has moved in since this device last looked, one line appears under the grove, for example "A butterfly has found your grove." or "Two bees have found your grove." It shows once, and is remembered on this device only.
- **Calm movement:** animals move at most 20 frames a second while they are visible, stop when the tab is hidden, and keep still under reduced motion.

## Global Constraints

- Work on branch `focus-grove-animals`, cut from `main`. Never push to `main` without David's go-ahead; pushing `main` deploys to production.
- No server or database changes.
- three.js stays out of every page except `/focus` and `/grove-lab`.
- Low-poly, flat-shaded, seeded by `mulberry32`, no textures or downloaded files. Each animal is under ~120 triangles.
- Performance: animal updates allocate nothing per frame. With animals present and visible, rendering runs at most 20 fps. Nothing renders while hidden or off-screen. Under reduced motion animals stand still, and the scene renders only when something changes.
- Animals stay above the island surface and inside the existing framing (`plantReach`/crown bounds). A bird's flight or a butterfly's loop never leaves the island's bounds.
- Honour WCAG AA, keyboard use, and light and dark themes. Copy is plain and kind.

## Review Focus

1. **A grove with no qualifying plants** shows no animals and no greeting, and its render cost is the same as today.
2. **A plant withers or a tree is tended** between visits: the animal counts follow the living plants only. A count that goes down (it can't today, but the code must not crash) simply shows fewer animals.
3. **Twenty minutes in a hidden tab, then back:** animals resume where they should be, with no burst of catch-up movement.
4. **The greeting** appears once per newcomer, never on first sight of an empty grove, and never twice on reload.
5. **Theme change mid-flight** rebuilds animal colours without losing their places.

---

### Task 1: Habitat rules

**Files:** Create `lib/grove/habitat.ts`, `lib/grove/habitat.test.ts`.

**Interfaces — Produces:**

```ts
export const ANIMALS = ["BUTTERFLY", "BEE", "BIRD", "SQUIRREL"] as const;
export type AnimalKind = (typeof ANIMALS)[number];
export type Resident = { kind: AnimalKind; id: string; home: string };   // home = the id of the plant it lives around; id stable for the same grove
export function residents(plants: GrovePlant[]): Resident[];
export function census(rs: Resident[]): Record<AnimalKind, number>;
export function newcomers(seen: Record<AnimalKind, number>, now: Record<AnimalKind, number>): Record<AnimalKind, number>;   // per kind max(0, now - seen)
export function greeting(n: Record<AnimalKind, number>): string | null; // e.g. "A butterfly has found your grove." / "Two bees and a bird have found your grove."; null when nothing is new
```

**Rules:**
- Counts follow the table in "Calls made", using `status === "ALIVE"` plants only. "Flowering" means WILDFLOWERS or BERRY_BUSH.
- Homes:
  - Butterflies and bees are assigned to flowering plants in a stable order (oldest `plantedAt` first, ties broken by id).
  - Birds go to trees of stage 2 or above, falling back to berry bushes.
  - Squirrels go to mature trees.
- Ids are `${kind}:${index}`, so the same grove always gives the same residents.

**Greeting wording:**
- Numbers one to five in words ("A", "Two", "Three", …).
- Kinds joined with "and" (and with commas for three or more).
- Plural names: butterflies, bees, birds, squirrels.

- [ ] **Step 1: Write failing tests.** Cover:
  - an empty grove;
  - one wildflower clump (1 butterfly);
  - 4 flowering plants (2 butterflies, 1 bee);
  - 5 flowering plants (3 butterflies, 2 bees);
  - withered plants ignored;
  - birds needing both berry bushes and a young tree;
  - two mature trees giving 2 squirrels and extra birds;
  - caps;
  - stable ids and homes;
  - `newcomers`;
  - `greeting` for one kind, two kinds, three kinds and nothing new.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit`. Expected: pass, clean.
- [ ] **Step 5: Commit** `feat(grove): which animals live in the grove, from its plants`.

---

### Task 2: Animal models and motion

**Files:** Create `lib/grove/animals.ts`, `lib/grove/animals.test.ts`.

**Interfaces — Produces:**

```ts
export type Home = { x: number; z: number; groundY: number; perchY: number; radius: number };   // world units; perchY = canopy or bloom height to sit on
export type AnimalModel = {
  group: THREE.Group;
  update(timeMs: number): void;   // pure function of time: same time → same pose; allocation-free
  setTheme(theme: Theme): void;
  dispose(): void;
};
export function buildAnimal(kind: AnimalKind, seed: number, theme: Theme, home: Home): AnimalModel;
export const ANIMAL_FPS = 20;
```

**Look and motion.** This is the builder's craft within these limits: same flat-shaded low-poly style as the plants, all seeded.

- **Butterfly:** a slim body and two pairs of flat faceted wings in a seeded warm colour. It loops lazily around its home (radius ≈ 0.25–0.4, height 0.3–0.7) with a wing flap of about 6 per second, and now and then settles on the bloom height for a few seconds with its wings slowly opening.
- **Bee:** a small striped body (yellow/near-black bands) with tiny translucent wings. It does short darting visits between its home and one or two neighbouring flowering spots, with a fast wing buzz drawn as a small scale flicker.
- **Bird:** a round body, a head with a beak, two wings and a tail, in seeded soft colours (robin, sparrow or bluebird tones). It perches on its home's canopy (`perchY`), turns its head and hops on the perch. Every ~20–40 s it flies a short arc to the ground beside its tree, pecks, and flies back.
- **Squirrel:** a body, a head with ears, and a big bushy tail made of 3–4 faceted lumps, in warm brown. It runs short loops around its tree's base, sits up, and flicks its tail.

**Rules:**
- Motion is a pure function of `timeMs` plus the seed, so a long hidden gap just jumps to the right pose.
- All positions stay within `home.radius` of the home (birds' ground trips stay within 0.6) and above the ground.
- The colours meet the existing contrast rule against the grass in both themes.

- [ ] **Step 1: Write failing tests**, for each kind:
  - under the triangle budget;
  - deterministic: same seed and time give the same world positions;
  - over 0–120 s at 50 ms steps, every vertex stays within the home bounds and above `groundY − 0.01`;
  - `update` allocates nothing (spy on `THREE.Vector3`/`Color` constructors or compare object identities across calls);
  - `dispose` frees every geometry and material.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit` and `npm run build`. Expected: clean.
- [ ] **Step 5: Commit** `feat(grove): low-poly butterflies, bees, birds and squirrels built in code`.

---

### Task 3: Animals in the grove

**Files:** Modify `components/grove/GroveCanvas.tsx`, `components/grove/Grove.tsx` (only if props change), `app/grove-lab/GroveLab.tsx`.

**Behaviour:**
- Saved plants give `residents(plants)`. Each resident is built once, keyed by its id, and rebuilt only when its home or the theme changes. Its `Home` comes from its plant's spot and height (`fullHeight(species, stage)`; for trees, the top of the canopy).
- The growing plant during a session does not host animals. The animals of the saved grove stay where they are during a session.
- Render rate:
  - when animals are present and visible and motion is allowed, the loop renders at most `ANIMAL_FPS`, and faster only while something else needs 30 fps (growing, dragging, a tween);
  - with no animals, the existing rules hold exactly;
  - under reduced motion, animals take a still pose (`update(0)`) and the scene renders only on change.
- Rendering stops while hidden or off-screen, as today.
- The lab gains an "Animals" toggle (on by default) and a grove preset that has every kind.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit` and `npm run build`. Expected: clean; three.js still only in the lazy chunk.
- [ ] **Step 3: Controller look** at `/grove-lab`:
  - each kind visible and recognisable;
  - motion calm, not busy;
  - nothing leaves the island;
  - dark mode;
  - phone width;
  - with 0 animals the scene is unchanged.

  Visual fixes go back to the implementer.
- [ ] **Step 4: Commit** `feat(grove): animals live in the grove`.

---

### Task 4: Greeting newcomers on the Focus page

**Files:** Create `lib/grove/seenAnimals.ts` (+ test). Modify `app/focus/page.tsx`, `components/focus/groveText.tsx`.

**Behaviour:**
- `seenAnimals` reads and writes a `Record<AnimalKind, number>` under the localStorage key `grove-animals-seen`.
- It is guarded with try/catch, and a malformed value counts as "nothing seen".
- On the first-ever load (no key), it stores the current census silently and shows no greeting, so animals already present aren't announced as new.
- On later loads, when the grove has loaded:
  - if `greeting(newcomers(seen, census(residents(plants))))` is not null, show it as one quiet line under the grove's plant-and-seed line;
  - then save the new census.
  - It is not shown again on reload.
- The grove's accessible label gains the animals, e.g. "Your grove: 6 plants, 2 butterflies and a bee".

- [ ] **Step 1: Write failing tests** for `seenAnimals`: missing key → null; malformed → null; round trip.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `npm test`, `npx tsc --noEmit` and `npm run build`. Expected: clean.
- [ ] **Step 4: Commit** `feat(grove): a quiet greeting when a new animal moves in`.

---

### Task 5: Live check

- [ ] **Step 1:** With David's go-ahead, push `focus-grove-animals` and check it on the branch preview in David's browser. There is no SQL step.
  - His real grove (wildflowers, fern, young tree) should show 1 butterfly.
  - Add nothing to his grove unless he agrees.
  - Use `/grove-lab` on the preview for the other kinds.
- [ ] **Step 2:** Report to David. Merging to `main` is his call. Update the Obsidian note named in `CLAUDE.md`.
