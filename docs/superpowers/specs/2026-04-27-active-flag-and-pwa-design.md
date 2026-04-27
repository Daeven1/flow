# Active Project Flag + PWA Design

**Date:** 2026-04-27  
**Status:** Approved

## Overview

Two independent, additive features:
1. Projects can be marked "active" — the card turns light green on the projects list page.
2. The app is installable as a PWA on iPhone via a web manifest and touch icons.

---

## Feature 1: Active Project Flag

### Schema

Add one field to the `Project` model:

```prisma
model Project {
  // existing fields ...
  active Boolean @default(false)
}
```

Migration required. Existing projects get `active = false`.

### API

`PATCH /api/projects/[id]` already accepts any subset of project fields via presence checks (`"key" in body`). Add `active` to that handler:

```ts
if ("active" in body) data.active = Boolean(body.active);
```

No new routes needed. `GET /api/projects` and `GET /api/projects/[id]` return the field automatically once it exists on the model.

### UI — Projects list page (`app/projects/page.tsx`)

Each project card gets a small toggle button. Placement: left of the `ArrowUpRight` open-project link, right side of the card header row.

**Toggle button:**
- Icon: `CheckSquare` (active) / `Square` (inactive) from lucide-react, `h-4 w-4`
- Color: `text-green-500` when active, `text-slate-300 dark:text-zinc-600` when inactive
- `title` attribute: "Mark active" / "Mark inactive"

**Card background when active:**
```
bg-green-50 dark:bg-green-950/30
border-green-300 dark:border-green-800
```
When inactive, card uses its existing styles unchanged.

**Interaction:**
- Click toggles `active` state optimistically in local React state
- `PATCH /api/projects/[id]` fires in background with `{ active: !current }`
- On fetch error: revert to previous state (same rollback pattern as drag-to-sort)

---

## Feature 2: PWA

### Icon generation

**Source:** An SVG drawn in code — dark slate circle (`#1e293b`, full bleed) with an organic leafy checkmark in green (`#22c55e`). The check stroke has a gentle curve; the upstroke tip ends in a small leaf flourish (a short curved stroke angled outward).

**Output files (one-time generation script):**
- `public/icon-512.png` — 512×512, for the web manifest
- `public/icon-180.png` — 180×180, for iOS apple-touch-icon

**Script:** `scripts/generate-icons.mjs` — uses `sharp` (dev dependency) to rasterise the SVG string at each size.

Run once locally; output PNGs are committed to the repo so Vercel never needs to run the script.

### Manifest

`public/manifest.json`:

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
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-180.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```

`start_url` is `/daily` — the most useful landing page after install.

### `app/layout.tsx` changes

Add to `<head>` (via Next.js `metadata` export or direct `<link>`/`<meta>` tags):

```tsx
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icon-180.png" />
<meta name="theme-color" content="#1e293b" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="flow" />
```

### Installation

No in-app install prompt needed. On iPhone, user opens the app in Safari → Share → Add to Home Screen. The manifest and touch icon handle the rest.

---

## Out of Scope

- Service worker / offline support — not added (adds complexity, not needed for basic installability)
- Android-specific splash screen config
- In-app install prompt / banner
- Active flag affecting sort order (drag-to-sort handles ordering independently)
- Active flag visible on the project detail page (list-only indicator)
