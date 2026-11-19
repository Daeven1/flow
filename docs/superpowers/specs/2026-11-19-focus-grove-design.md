# Focus Grove: a focus timer that grows a living grove

Date: 2026-11-19. Status: draft, awaiting David's approval.

Lines marked **(David)** are things David said or chose. Lines marked **(call)** are choices made on his behalf that he can overrule.

## Intent

Grove gets a Pomodoro-style focus timer whose clock is a plant growing. Each focused work session of 20 to 30 minutes grows one plant in a small low-poly grove. Plants die if David does not stay focused. As the grove fills with berries, saplings and trees, it gives shelter to birds, squirrels and insects, so that focused work visibly builds a healthy little biome. **(David)**

Why: the app is called Grove and its product notes say the nature metaphor "is not decoration". This makes the metaphor literal, gives focus a visible reward, and gives David a calm thing to glance at instead of his phone's other apps.

## Goals

- Starting a session means naming the task being worked on; the plant grows for the length of the session and acts as the timer. **(David)**
- Finish the session and the plant is kept. Lose focus and it dies. **(David)**
- Ticking off to-do items earns seeds, and seeds are what let David plant something new. **(David, merged with the session idea at Claude's suggestion and accepted)**
- Works on the phone and in a browser tab, with a different rule for "losing focus" on each. **(David)**
- The grove is drawn as a true 3D low-poly scene: plants are shapes built in code so they grow smoothly; animals use free ready-made low-poly models. **(David picked this approach)**
- Animals arrive as the planting gives them habitat. **(David)**

## Non-goals (first version)

- Sound, notifications, sharing, a native phone app, seasons or weather, streak penalties.
- The grove decaying over days of absence.
- Showing the grove on the Daily page.

## Anti-goals

- A guilt machine. One bad session must never damage what is already established in the grove.
- A second thing to manage. No watering, weeding or upkeep.
- Being unable to focus because of the game. Running out of seeds must never stop David starting a session.
- Slowing the rest of the app. The 3D code loads only on the Focus page.

## Approaches considered

1. **True 3D scene, shapes built in code.** Smooth growth, can be turned, most charming, most work; hand-built animals look crude.
2. **True 3D scene, ready-made models.** Polished sooner; growth must be faked by swapping models; the look is someone else's.
3. **Flat fixed-angle drawing that looks low-poly.** Lightest and quickest; no turning, less depth.

**Picked: 1 for plants, with ready-made models for animals only.** Growth is the heart of the timer so plants must grow smoothly; animals are the part hardest to shape by hand. **(David agreed to this recommendation)**

## How it behaves

### Where it lives

The existing Focus page (`app/focus/page.tsx`). Today it has no timer: David picks tasks into an ordered queue and works through them as a sticky-note pile (`components/StickyPile.tsx`), ticking each off. **(call)** Keep the queue. "Start session" now opens the grove view: the grove, the growing plant, the time left, and the current task from the queue with its Done button. Ticking a task mid-session moves to the next task in the queue; the session carries on. When no session is running, the Focus page shows the grove at rest above the queue builder.

### A session

1. David builds his queue as today (at least one task).
2. He chooses a length: 20, 25 or 30 minutes; 25 is preselected. **(call)**
3. He chooses what to grow (see Seeds and plants) and taps a free spot in the grove to plant it. **(call: he chooses the spot)**
4. The plant grows continuously from seedling to full size over the session. The time left is also shown as plain numbers, small.
5. At the end the plant is kept and a short, quiet celebration plays. An optional 5-minute break timer is offered; skipping or overrunning it costs nothing. **(call)**

**Finishing the list early. (David)** If the last task in the queue is ticked off before the timer ends, the session ends there and counts as finished: the plant quickly grows the rest of the way to full size and is kept (a tended tree advances its stage), and the same quiet celebration plays. Tasks cannot be added mid-session. Only the minutes actually worked are recorded. David knows this lets a quickly ticked task bank a plant and chose the kinder rule anyway; do not add a minimum time.

The clock is worked out from the recorded start time, never from counting ticks, so a reload or a sleeping tab cannot stretch or shorten a session. A session belongs to the device that started it. **(call)**

### Losing focus

- **Phone rule (strict):** the plant dies if David leaves Grove (switches app, locks the screen) before the end. **(David)** **(call)** A 10-second grace period forgives a slip or a notification glance. The screen is kept awake during a session; the start screen says the phone should stay open and is best plugged in.
- **Browser rule (gentle):** the plant dies only if David presses "Give up" before the end. **(David accepted)** Leaving or closing the tab does nothing; if he returns after the end time the session counts as finished.
- **(call)** Grove picks the rule by device (touch device with a small screen gets strict) and shows which rule applies on the start screen, with a switch to change it for that session.

### What dying means

**(call, David has not yet confirmed the details)**
- Only the plant being grown in that session dies. Everything already in the grove is safe.
- A dead plant stays as a small withered stalk on its spot until the end of the next day, then disappears and frees the spot.
- Seeds spent on it are not returned.
- If the session was tending an existing tree (below), the tree simply does not advance. It never dies.

### Seeds and plants

- Every task ticked off anywhere in Grove earns 1 seed. Un-ticking takes it back (never below zero). **(call)**
- One humble plant is always free (for example a clump of wildflowers or a fern), so focus is never blocked. **(call)**
- Seeds buy better species. Suggested starting set, tunable by the builder: wildflowers (free), berry bush (2 seeds), sapling (3 seeds).
- **(call)** Trees take more than one session. A sapling planted in one session can be "tended" in later sessions instead of planting something new; each finished tending session advances it one stage: sapling, young tree, mature tree. Tending costs no seeds.
- The grove starts as a small island with a grid of planting spots (about 6 by 6) and widens when nearly full. **(call)**

### Animals

Animals are drawn by what is planted, not bought. **(David)** Suggested thresholds, tunable:

| Arrives | When |
|---|---|
| Butterflies, bees | first wildflowers or berry bush |
| Small birds | several berry bushes and one young tree |
| Squirrels | first mature tree |
| More and varied birds | several mature trees |

Animals move about gently (flutter, hop, perch). They never leave because of a failed session. **(call)**

### Shared across devices and modes

One grove per signed-in account, the same on phone and laptop, and the same in Pro and Home modes. **(call)** Each account (including student-mode users) has its own.

### Time page

A finished session's minutes should show up on the Time page against the task(s) worked on. **(call)** Today `POST /api/timelogs` records one entry per task and overwrites the task's `actualMinutes`; how session minutes are split across several tasks ticked in one session is left to the builder, as long as totals are not double-counted.

## Constraints

- Stack: Next.js 16 App Router, React 18, Prisma on Supabase Postgres, Tailwind. Every API route needs `export const runtime = 'nodejs'` and scopes queries to `getUser()`'s user id.
- Pushing to `main` deploys to production. Build on a feature branch.
- New tables or columns must exist in the database **before** the code that uses them reaches `main`. The database ports are unreachable from David's school network, so schema changes are delivered as SQL for David to paste into the Supabase dashboard's SQL Editor.
- 3D: use three.js through a React wrapper compatible with React 18 (check versions at plan time). Load it only on the Focus page.
- Animal models must be free for this use with the licence recorded in the repo (CC0 packs preferred), stored in `public/`.
- Phone: Grove runs as a web app added to the home screen, not a native app. Leaving is detected through the page becoming hidden; the screen is kept on with the browser's screen wake lock. If the device has no 3D support or wake lock, the timer must still work, falling back to a plain progress display and saying so.
- Respect the reduced-motion setting, WCAG AA contrast, keyboard use, and both light (Calm Pool) and dark (Midnight Navy) backgrounds.
- A phone left on for 30 minutes: keep the scene light (low frame rate when idle is fine).

## Left to the builder

- Data shapes. Expected: a record per plant (owner, species, stage, spot, alive or withered, dates), a record per focus session (owner, task, plant, start, planned length, outcome, which rule), and a seed balance.
- Exact species, costs, growth animation, animal thresholds and movement, island shape and how it widens.
- Which model pack for animals.
- Whether timer and rule logic gets automated tests (strongly preferred: it is pure logic).
- How to split the work. Suggested order, each piece usable alone: (1) timer, sessions and both focus rules with a plain display; (2) the 3D grove and growing plants; (3) seeds, species and tending; (4) animals.
