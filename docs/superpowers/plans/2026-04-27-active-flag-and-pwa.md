# Active Project Flag + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "active" toggle to project cards that turns them light green, and make the app installable as a PWA on iPhone with a custom organic leafy checkmark icon.

**Architecture:** Feature 1 adds a boolean field to the Project model, wires it through the existing PATCH API (which already uses presence-check pattern), and adds a toggle button + conditional card styling on the projects list page. Feature 2 generates PNG icons from an SVG via a one-time Node script using `sharp`, creates a web manifest, and adds PWA meta tags to `app/layout.tsx`.

**Tech Stack:** Prisma (schema migration), Next.js App Router, Tailwind CSS, lucide-react, sharp (dev dep, icon generation only)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `active Boolean @default(false)` to Project |
| `prisma/migrations/…` | Create (auto) | Migration SQL from `prisma migrate dev` |
| `app/api/projects/[id]/route.ts` | Modify | Handle `active` in PATCH body |
| `app/projects/page.tsx` | Modify | Project interface, toggle button, conditional card bg |
| `scripts/generate-icons.mjs` | Create | SVG → PNG at 512×512 and 180×180 using sharp |
| `public/icon-512.png` | Create (generated) | Manifest icon |
| `public/icon-180.png` | Create (generated) | iOS apple-touch-icon |
| `public/manifest.json` | Create | PWA web manifest |
| `app/layout.tsx` | Modify | PWA meta tags in `<head>` |

---

## Task 1: Schema — add `active` field to Project

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the field**

Open `prisma/schema.prisma`. The Project model currently ends at `createdAt`. Add `active` after `sortOrder`:

```prisma
model Project {
  id          String    @id @default(cuid())
  userId      String
  name        String
  deadline    DateTime?
  templateKey String?
  notes       String    @default("")
  sortOrder   Int       @default(0)
  active      Boolean   @default(false)
  createdAt   DateTime  @default(now())
  tasks       Task[]
}
```

- [ ] **Step 2: Run the migration**

```bash
npx prisma migrate dev --name add_project_active
```

Expected output:
```
Applying migration `..._add_project_active`
✔ Generated Prisma Client
```

- [ ] **Step 3: Verify migration is clean**

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add active boolean to Project model"
```

---

## Task 2: API — handle `active` in PATCH

**Files:**
- Modify: `app/api/projects/[id]/route.ts` (lines 33–39)

- [ ] **Step 1: Add `active` to the PATCH destructure and presence check**

The current PATCH handler destructures `{ name, deadline, notes, sortOrder }` from the body and has four presence checks. Add `active` to both:

```ts
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, deadline, notes, sortOrder, active } = body;

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = name;
  if ("deadline" in body) data.deadline = deadline ? new Date(deadline) : null;
  if ("notes" in body) data.notes = notes;
  if ("sortOrder" in body) data.sortOrder = Number(sortOrder);
  if ("active" in body) data.active = Boolean(active);

  const project = await prisma.project.update({
    where: { id, userId },
    data,
    include: { tasks: { orderBy: { deadline: "asc" } } },
  });

  return NextResponse.json(project);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/[id]/route.ts
git commit -m "feat: handle active field in project PATCH API"
```

---

## Task 3: UI — active toggle button and green card styling

**Files:**
- Modify: `app/projects/page.tsx`

- [ ] **Step 1: Add `active` to the Project interface and imports**

At the top of `app/projects/page.tsx`, find the `Project` interface and add `active`:

```ts
interface Project {
  id: string;
  name: string;
  deadline: string | null;
  templateKey: string | null;
  active: boolean;
  tasks: Task[];
}
```

In the lucide-react import line, add `CheckSquare` and `Square`:

```ts
import {
  Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Pencil, Check, X, BookmarkPlus, Moon, CalendarClock, Wand2,
  GripVertical, ArrowUpRight, CheckSquare, Square,
} from "lucide-react";
```

- [ ] **Step 2: Add `toggleActive` function**

Add this function after `handleDragEnd` (around line 248), before the `return` statement:

```ts
async function toggleActive(id: string, active: boolean) {
  const previous = projects;
  setProjects((prev) => prev.map((p) => p.id === id ? { ...p, active } : p));
  try {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
  } catch {
    setProjects(previous);
  }
}
```

- [ ] **Step 3: Update card background to respond to `active`**

Find the `<div>` that wraps each draggable card (around line 345–351). It currently reads:

```tsx
className={`rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 ${
  snapshot.isDragging ? "shadow-lg" : ""
}`}
```

Replace with:

```tsx
className={`rounded-xl border transition-colors ${
  project.active
    ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800"
    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
} ${snapshot.isDragging ? "shadow-lg" : ""}`}
```

- [ ] **Step 4: Add toggle button to the card header row**

In the card header row, the current button order from left to right is:
`GripVertical | ChevronDown/Right | flex-1 info | ArrowUpRight | BookmarkPlus | Trash2`

Insert the active toggle button **between** `flex-1 info` and the `ArrowUpRight` link. Find the `<Link href={...}>` for ArrowUpRight (around line 386) and add the button immediately before it:

```tsx
<button
  onClick={() => toggleActive(project.id, !project.active)}
  className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
  title={project.active ? "Mark inactive" : "Mark active"}
>
  {project.active
    ? <CheckSquare className="h-4 w-4 text-green-500" />
    : <Square className="h-4 w-4 text-slate-300 dark:text-zinc-600" />}
</button>
<Link
  href={`/projects/${project.id}`}
  ...
>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual browser check**

Start the dev server (`npm run dev`), navigate to `/projects`. Click the square icon on a project card — it should turn into a green checkmark and the card background should shift to light green. Refresh the page — state should persist (loaded from DB). Click again to deactivate.

- [ ] **Step 7: Commit**

```bash
git add app/projects/page.tsx
git commit -m "feat: active project toggle with green card highlight"
```

---

## Task 4: PWA icons — generate PNG files

**Files:**
- Create: `scripts/generate-icons.mjs`
- Create (generated): `public/icon-512.png`, `public/icon-180.png`

- [ ] **Step 1: Install sharp as a dev dependency**

```bash
npm install --save-dev sharp
```

Expected: sharp added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create the icon generation script**

Create `scripts/generate-icons.mjs` with this exact content:

```js
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dark slate background, organic leafy checkmark in green.
// The check curves from bottom-left through a valley to top-right.
// A teardrop leaf flourish extends from the upstroke tip.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1e293b" rx="80"/>
  <path
    d="M 110 268 C 130 295 180 345 215 358 L 398 152"
    fill="none"
    stroke="#22c55e"
    stroke-width="44"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M 398 152 C 415 128 442 120 430 100 C 414 122 402 140 398 152 Z"
    fill="#22c55e"
  />
</svg>`;

const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'icon-180.png' },
];

for (const { size, name } of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name));
  console.log(`✓ Generated public/${name}`);
}
```

- [ ] **Step 3: Run the script**

```bash
node scripts/generate-icons.mjs
```

Expected output:
```
✓ Generated public/icon-512.png
✓ Generated public/icon-180.png
```

- [ ] **Step 4: Verify files exist**

```bash
ls -lh public/icon-*.png
```

Expected: two files, `icon-512.png` (~15–40 KB) and `icon-180.png` (~5–15 KB).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-icons.mjs public/icon-512.png public/icon-180.png package.json package-lock.json
git commit -m "feat: add PWA icon generation script and generated icons"
```

---

## Task 5: PWA manifest

**Files:**
- Create: `public/manifest.json`

- [ ] **Step 1: Create the manifest**

Create `public/manifest.json`:

```json
{
  "name": "flow",
  "short_name": "flow",
  "description": "Personal task and project manager",
  "start_url": "/daily",
  "display": "standalone",
  "background_color": "#1e293b",
  "theme_color": "#1e293b",
  "icons": [
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-180.png",
      "sizes": "180x180",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat: add PWA web manifest"
```

---

## Task 6: PWA meta tags in layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add PWA tags to `<head>`**

Open `app/layout.tsx`. The `<head>` block currently contains only the theme-flash prevention script. Add the PWA tags after that script:

```tsx
<head>
  {/* Prevents flash of wrong theme on load */}
  <script
    dangerouslySetInnerHTML={{
      __html: `(function(){try{var m=localStorage.getItem('flow-theme');if(m==='dark'||(!m&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
    }}
  />
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icon-180.png" />
  <meta name="theme-color" content="#1e293b" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="flow" />
</head>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Start dev server (`npm run dev`). Open Chrome DevTools → Application → Manifest. Confirm the manifest loads, icons appear, and `start_url` is `/daily`.

On an iPhone with the deployed app: Safari → share sheet → "Add to Home Screen" — should show the icon preview and name "flow".

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add PWA meta tags for installability"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `active Boolean @default(false)` on Project — Task 1
- ✅ PATCH handles `active` via presence check — Task 2
- ✅ `CheckSquare`/`Square` toggle button left of ArrowUpRight — Task 3
- ✅ Card turns `bg-green-50` / `border-green-300` when active — Task 3
- ✅ Optimistic update with rollback on error — Task 3
- ✅ SVG icon: dark slate bg, organic leafy checkmark in green, leaf flourish at tip — Task 4
- ✅ `public/icon-512.png` and `public/icon-180.png` generated — Task 4
- ✅ `public/manifest.json` with `start_url: "/daily"`, `display: "standalone"` — Task 5
- ✅ `app/layout.tsx` PWA meta tags — Task 6

**No placeholders found.**

**Type consistency:** `active: boolean` used consistently across interface, toggle function, API body, and PATCH handler.
