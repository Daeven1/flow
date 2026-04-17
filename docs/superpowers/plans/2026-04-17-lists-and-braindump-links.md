# Lists Page & Brain Dump Hyperlinks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/lists` page with side-by-side Movies/Shows and Books watchlists (search-and-autopopulate from OMDB + Google Books), and enrich brain dump output by converting URLs to titled hyperlinks.

**Architecture:** Two new Prisma models (`WatchItem`, `ReadItem`) backed by 4 REST API routes. The `/lists` page renders two client components that call external APIs (OMDB, Google Books) directly for search, then persist via internal API. Brain dump URL enrichment adds a server-side `/api/fetch-title` route and a post-processing step in the Daily page that scans the raw brain dump text for URLs after AI parsing.

**Tech Stack:** Next.js App Router, Prisma + PostgreSQL, Supabase auth, Tailwind CSS, lucide-react, OMDB API, Google Books API.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `WatchItem` and `ReadItem` models |
| `app/api/lists/watch/route.ts` | Create | GET all watch items, POST new watch item |
| `app/api/lists/watch/[id]/route.ts` | Create | PATCH (toggle checked), DELETE watch item |
| `app/api/lists/read/route.ts` | Create | GET all read items, POST new read item |
| `app/api/lists/read/[id]/route.ts` | Create | PATCH (toggle checked), DELETE read item |
| `app/lists/WatchList.tsx` | Create | OMDB search + movies/shows list column |
| `app/lists/ReadList.tsx` | Create | Google Books search + books list column |
| `app/lists/page.tsx` | Create | Two-column layout wrapping WatchList + ReadList |
| `components/Nav.tsx` | Modify | Add "Lists" nav item |
| `app/api/fetch-title/route.ts` | Create | Server-side page title fetcher for URLs |
| `app/daily/page.tsx` | Modify | Post-process brain dump for URL→link enrichment |

---

## Task 1: Add Prisma Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add WatchItem and ReadItem models to schema.prisma**

Append to the end of `prisma/schema.prisma`:

```prisma
model WatchItem {
  id        String   @id @default(cuid())
  userId    String
  title     String
  genre     String   @default("")
  rtScore   Int?
  year      String   @default("")
  poster    String?
  checked   Boolean  @default(false)
  createdAt DateTime @default(now())
}

model ReadItem {
  id        String   @id @default(cuid())
  userId    String
  title     String
  genre     String   @default("")
  avgRating Float?
  authors   String   @default("")
  thumbnail String?
  checked   Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_watch_read_items
```

Expected: Migration created and applied. Prisma client regenerated automatically.

- [ ] **Step 3: Verify schema compiles**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add WatchItem and ReadItem prisma models"
```

---

## Task 2: Watch Item API Routes

**Files:**
- Create: `app/api/lists/watch/route.ts`
- Create: `app/api/lists/watch/[id]/route.ts`

- [ ] **Step 1: Create `app/api/lists/watch/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.watchItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, genre, rtScore, year, poster } = await req.json();

  const item = await prisma.watchItem.create({
    data: {
      userId,
      title: title ?? "",
      genre: genre ?? "",
      rtScore: rtScore ?? null,
      year: year ?? "",
      poster: poster ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/lists/watch/[id]/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("checked" in body) data.checked = body.checked;

  const item = await prisma.watchItem.update({ where: { id, userId }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.watchItem.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Smoke test via curl (dev server must be running)**

```bash
# Start dev server first: npm run dev
curl -s http://localhost:3000/api/lists/watch
```

Expected: `{"error":"Unauthorized"}` (no session) — route is wired up correctly.

- [ ] **Step 4: Commit**

```bash
git add app/api/lists/watch/
git commit -m "feat: add watch item API routes (GET, POST, PATCH, DELETE)"
```

---

## Task 3: Read Item API Routes

**Files:**
- Create: `app/api/lists/read/route.ts`
- Create: `app/api/lists/read/[id]/route.ts`

- [ ] **Step 1: Create `app/api/lists/read/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET() {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.readItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, genre, avgRating, authors, thumbnail } = await req.json();

  const item = await prisma.readItem.create({
    data: {
      userId,
      title: title ?? "",
      genre: genre ?? "",
      avgRating: avgRating ?? null,
      authors: authors ?? "",
      thumbnail: thumbnail ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/lists/read/[id]/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("checked" in body) data.checked = body.checked;

  const item = await prisma.readItem.update({ where: { id, userId }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.readItem.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/lists/read/
git commit -m "feat: add read item API routes (GET, POST, PATCH, DELETE)"
```

---

## Task 4: Add API Keys to Environment

**Files:**
- `.env.local` (local only — never commit)

OMDB API key: get a free key at https://www.omdbapi.com/apikey.aspx
Google Books API key: create one at https://console.cloud.google.com → APIs & Services → Credentials → Create API Key → restrict to "Books API".

- [ ] **Step 1: Add keys to `.env.local`**

```bash
# Add these two lines to .env.local
OMDB_API_KEY=your_omdb_key_here
NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY=your_google_books_key_here
```

Note: `NEXT_PUBLIC_` prefix exposes the key to the browser (needed since search runs client-side). Google Books API keys for read-only public book data do not require a secret. OMDB key also runs client-side — no proxy needed for either.

- [ ] **Step 2: Verify keys work**

```bash
# Test OMDB
curl "http://www.omdbapi.com/?s=inception&apikey=YOUR_KEY" | head -c 200

# Test Google Books
curl "https://www.googleapis.com/books/v1/volumes?q=dune&key=YOUR_KEY" | head -c 200
```

Expected: JSON response with search results, not an error.

- [ ] **Step 3: Add keys to Vercel env (for production)**

```bash
vercel env add OMDB_API_KEY
vercel env add NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY
```

---

## Task 5: WatchList Component

**Files:**
- Create: `app/lists/WatchList.tsx`

OMDB search flow:
1. `?s={query}&apikey={key}` → returns `{ Search: [{ Title, Year, imdbID, Poster }] }`
2. On item select: `?i={imdbID}&apikey={key}` → returns `{ Genre, Ratings: [{ Source, Value }] }` to extract RT score and genre, then POST to `/api/lists/watch`.

- [ ] **Step 1: Create `app/lists/WatchList.tsx`**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Circle, Trash2, Loader2, Film } from "lucide-react";
import { Input } from "@/components/ui/input";

type WatchItem = {
  id: string;
  title: string;
  genre: string;
  rtScore: number | null;
  year: string;
  poster: string | null;
  checked: boolean;
};

type OmdbSearchResult = {
  Title: string;
  Year: string;
  imdbID: string;
  Poster: string;
};

const OMDB_KEY = process.env.NEXT_PUBLIC_OMDB_API_KEY;

export function WatchList() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OmdbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/lists/watch")
      .then((r) => r.json())
      .then(setItems);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=${OMDB_KEY}`
        );
        const data = await res.json();
        setResults(data.Search?.slice(0, 6) ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setResults([]);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function addItem(result: OmdbSearchResult) {
    setAdding(result.imdbID);
    setQuery("");
    setResults([]);
    try {
      // Fetch detail for genre + RT score
      const detailRes = await fetch(
        `https://www.omdbapi.com/?i=${result.imdbID}&apikey=${OMDB_KEY}`
      );
      const detail = await detailRes.json();
      const rtRating = detail.Ratings?.find(
        (r: { Source: string; Value: string }) => r.Source === "Rotten Tomatoes"
      );
      const rtScore = rtRating ? parseInt(rtRating.Value) : null;

      const res = await fetch("/api/lists/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.Title,
          year: result.Year,
          genre: detail.Genre ?? "",
          rtScore: isNaN(rtScore as number) ? null : rtScore,
          poster: result.Poster !== "N/A" ? result.Poster : null,
        }),
      });
      const item = await res.json();
      setItems((prev) => [...prev, item]);
    } finally {
      setAdding(null);
    }
  }

  async function toggleChecked(item: WatchItem) {
    const updated = { ...item, checked: !item.checked };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await fetch(`/api/lists/watch/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: updated.checked }),
    });
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/lists/watch/${id}`, { method: "DELETE" });
  }

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
        <h2 className="font-semibold text-sm">Movies &amp; Shows</h2>
      </div>

      {/* Search */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Input
            placeholder="Search movies &amp; shows…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm pr-8"
          />
          {(searching || adding) && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
          )}
        </div>
        {results.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
            {results.map((r) => (
              <button
                key={r.imdbID}
                onClick={() => addItem(r)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {r.Poster !== "N/A" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.Poster} alt="" className="h-10 w-7 object-cover rounded shrink-0" />
                ) : (
                  <div className="h-10 w-7 bg-slate-100 dark:bg-zinc-700 rounded shrink-0" />
                )}
                <div>
                  <div className="text-sm font-medium">{r.Title}</div>
                  <div className="text-xs text-slate-400 dark:text-zinc-500">{r.Year}</div>
                </div>
              </button>
            ))}
            {results.length === 0 && !searching && query && (
              <div className="px-3 py-2 text-sm text-slate-400 dark:text-zinc-500">No results found</div>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-1">
        {unchecked.map((item) => (
          <WatchItemRow key={item.id} item={item} onToggle={toggleChecked} onDelete={deleteItem} />
        ))}
        {checked.length > 0 && unchecked.length > 0 && (
          <div className="border-t border-slate-100 dark:border-zinc-800 my-2" />
        )}
        {checked.map((item) => (
          <WatchItemRow key={item.id} item={item} onToggle={toggleChecked} onDelete={deleteItem} />
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-2">Search above to add movies or shows.</p>
        )}
      </div>
    </div>
  );
}

function WatchItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: WatchItem;
  onToggle: (item: WatchItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`flex items-center gap-2 py-1.5 group ${item.checked ? "opacity-50" : ""}`}>
      <button onClick={() => onToggle(item)} className="shrink-0">
        {item.checked ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4 text-slate-300 dark:text-zinc-600 hover:text-green-500 transition-colors" />
        )}
      </button>
      {item.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.poster} alt="" className="h-8 w-5 object-cover rounded shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${item.checked ? "line-through" : ""} truncate block`}>
          {item.title}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.year && (
            <span className="text-xs text-slate-400 dark:text-zinc-500">{item.year}</span>
          )}
          {item.genre && (
            <span className="text-xs bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {item.genre.split(",")[0].trim()}
            </span>
          )}
          {item.rtScore !== null && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              item.rtScore >= 70
                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                : item.rtScore >= 50
                ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
                : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
            }`}>
              🍅 {item.rtScore}%
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(item.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 dark:text-zinc-600 hover:text-red-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

Note: `NEXT_PUBLIC_OMDB_API_KEY` — make sure the env var name matches exactly (step 2 above used `NEXT_PUBLIC_OMDB_API_KEY`; update `.env.local` and Vercel accordingly if you used a different name in Task 4).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/lists/WatchList.tsx
git commit -m "feat: add WatchList component with OMDB search"
```

---

## Task 6: ReadList Component

**Files:**
- Create: `app/lists/ReadList.tsx`

Google Books search: `GET https://www.googleapis.com/books/v1/volumes?q={query}&key={key}`
Response: `{ items: [{ id, volumeInfo: { title, authors, categories, averageRating, imageLinks: { thumbnail } } }] }`

- [ ] **Step 1: Create `app/lists/ReadList.tsx`**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Circle, Trash2, Loader2, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";

type ReadItem = {
  id: string;
  title: string;
  genre: string;
  avgRating: number | null;
  authors: string;
  thumbnail: string | null;
  checked: boolean;
};

type BookResult = {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    categories?: string[];
    averageRating?: number;
    imageLinks?: { thumbnail?: string };
  };
};

const BOOKS_KEY = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;

export function ReadList() {
  const [items, setItems] = useState<ReadItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/lists/read")
      .then((r) => r.json())
      .then(setItems);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&key=${BOOKS_KEY}`
        );
        const data = await res.json();
        setResults(data.items?.slice(0, 6) ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [query]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setResults([]);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function addItem(book: BookResult) {
    setAdding(book.id);
    setQuery("");
    setResults([]);
    const { title, authors, categories, averageRating, imageLinks } = book.volumeInfo;
    try {
      const res = await fetch("/api/lists/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          authors: authors?.join(", ") ?? "",
          genre: categories?.[0] ?? "",
          avgRating: averageRating ?? null,
          thumbnail: imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
        }),
      });
      const item = await res.json();
      setItems((prev) => [...prev, item]);
    } finally {
      setAdding(null);
    }
  }

  async function toggleChecked(item: ReadItem) {
    const updated = { ...item, checked: !item.checked };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await fetch(`/api/lists/read/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: updated.checked }),
    });
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/lists/read/${id}`, { method: "DELETE" });
  }

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
        <h2 className="font-semibold text-sm">Books</h2>
      </div>

      {/* Search */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Input
            placeholder="Search books…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm pr-8"
          />
          {(searching || adding) && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
          )}
        </div>
        {results.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => addItem(r)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
              >
                {r.volumeInfo.imageLinks?.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.volumeInfo.imageLinks.thumbnail.replace("http://", "https://")}
                    alt=""
                    className="h-10 w-7 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="h-10 w-7 bg-slate-100 dark:bg-zinc-700 rounded shrink-0" />
                )}
                <div>
                  <div className="text-sm font-medium line-clamp-1">{r.volumeInfo.title}</div>
                  <div className="text-xs text-slate-400 dark:text-zinc-500 line-clamp-1">
                    {r.volumeInfo.authors?.join(", ") ?? "Unknown author"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-1">
        {unchecked.map((item) => (
          <ReadItemRow key={item.id} item={item} onToggle={toggleChecked} onDelete={deleteItem} />
        ))}
        {checked.length > 0 && unchecked.length > 0 && (
          <div className="border-t border-slate-100 dark:border-zinc-800 my-2" />
        )}
        {checked.map((item) => (
          <ReadItemRow key={item.id} item={item} onToggle={toggleChecked} onDelete={deleteItem} />
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-2">Search above to add books.</p>
        )}
      </div>
    </div>
  );
}

function ReadItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ReadItem;
  onToggle: (item: ReadItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`flex items-center gap-2 py-1.5 group ${item.checked ? "opacity-50" : ""}`}>
      <button onClick={() => onToggle(item)} className="shrink-0">
        {item.checked ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4 text-slate-300 dark:text-zinc-600 hover:text-green-500 transition-colors" />
        )}
      </button>
      {item.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnail} alt="" className="h-8 w-5 object-cover rounded shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${item.checked ? "line-through" : ""} truncate block`}>
          {item.title}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.authors && (
            <span className="text-xs text-slate-400 dark:text-zinc-500 truncate max-w-[120px]">{item.authors.split(",")[0]}</span>
          )}
          {item.genre && (
            <span className="text-xs bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 px-1.5 py-0.5 rounded truncate max-w-[100px]">
              {item.genre}
            </span>
          )}
          {item.avgRating !== null && (
            <span className="text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
              ★ {item.avgRating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(item.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 dark:text-zinc-600 hover:text-red-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/lists/ReadList.tsx
git commit -m "feat: add ReadList component with Google Books search"
```

---

## Task 7: Lists Page + Nav

**Files:**
- Create: `app/lists/page.tsx`
- Modify: `components/Nav.tsx`

- [ ] **Step 1: Create `app/lists/page.tsx`**

```typescript
import { WatchList } from "./WatchList";
import { ReadList } from "./ReadList";

export default function ListsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Lists</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <WatchList />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <ReadList />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Lists" to Nav**

In `components/Nav.tsx`, add the import and nav item. Find the import block at the top:

```typescript
import {
  CalendarDays,
  FolderKanban,
  CheckSquare,
  Layers,
  Clock,
  BarChart2,
  Settings,
  LayoutTemplate,
  Crosshair,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
```

Replace with:

```typescript
import {
  CalendarDays,
  FolderKanban,
  CheckSquare,
  Layers,
  Clock,
  BarChart2,
  Settings,
  LayoutTemplate,
  Crosshair,
  Bookmark,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
```

Then find the `NAV_ITEMS` array and add the Lists entry after Templates:

```typescript
const NAV_ITEMS = [
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/sprints", label: "Sprints", icon: Layers },
  { href: "/focus", label: "Focus", icon: Crosshair },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/review", label: "Review", icon: BarChart2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/lists", label: "Lists", icon: Bookmark },
];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Manual test in browser**

Start dev server (`npm run dev`), navigate to `/lists`. Verify:
- Page loads with two columns
- "Lists" appears in nav and highlights when active
- Searching "inception" in Movies & Shows shows OMDB dropdown results
- Selecting a result adds it to the list with genre and RT score
- Checkbox toggles item to done (strikethrough, moved to bottom)
- Hover reveals delete button; clicking removes the item
- Searching a book title in Books shows Google Books results
- Selecting a book adds it with author, genre tag, and star rating

- [ ] **Step 5: Commit**

```bash
git add app/lists/ components/Nav.tsx
git commit -m "feat: add Lists page with Movies/Shows and Books columns; add nav item"
```

---

## Task 8: Fetch-Title API Route

**Files:**
- Create: `app/api/fetch-title/route.ts`

- [ ] **Step 1: Create `app/api/fetch-title/route.ts`**

```typescript
export const runtime = 'nodejs';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url || !/^https:\/\/.+/.test(url)) {
    return NextResponse.json({ title: null });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FlowApp/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ title: null });

    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = match ? match[1].trim().replace(/\s+/g, " ") : null;

    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: null });
  }
}
```

- [ ] **Step 2: Smoke test**

```bash
curl "http://localhost:3000/api/fetch-title?url=https://example.com"
```

Expected: `{"title":"Example Domain"}` (or similar)

```bash
curl "http://localhost:3000/api/fetch-title?url=http://evil.com"
```

Expected: `{"title":null}` (rejected — not https)

- [ ] **Step 3: Commit**

```bash
git add app/api/fetch-title/route.ts
git commit -m "feat: add server-side fetch-title API route for URL enrichment"
```

---

## Task 9: Brain Dump URL Enrichment

**Files:**
- Modify: `app/daily/page.tsx`

When the brain dump text contains URLs, show a "Links" panel alongside the parsed tasks preview. The panel fetches page titles server-side and renders each URL as a titled hyperlink.

- [ ] **Step 1: Add a `useFetchedLinks` hook inline in `app/daily/page.tsx`**

Add this function before the `DailyPage` component (after the existing helper functions):

```typescript
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s,)"']+/g;
  return [...new Set(text.match(urlRegex) ?? [])];
}
```

- [ ] **Step 2: Add link state and fetch effect inside `DailyPage`**

Inside the `DailyPage` component, after the existing `useState` calls, add:

```typescript
const [enrichedLinks, setEnrichedLinks] = useState<{ url: string; title: string | null }[]>([]);
```

Then after the `parseBrainDump` function, add an effect that fires when `parsedTasks` changes (i.e., after AI parsing):

```typescript
useEffect(() => {
  if (parsedTasks.length === 0) { setEnrichedLinks([]); return; }
  const urls = extractUrls(log.brainDump);
  if (urls.length === 0) { setEnrichedLinks([]); return; }

  setEnrichedLinks(urls.map((url) => ({ url, title: null })));

  urls.forEach(async (url) => {
    try {
      const res = await fetch(`/api/fetch-title?url=${encodeURIComponent(url)}`);
      const { title } = await res.json();
      setEnrichedLinks((prev) =>
        prev.map((l) => (l.url === url ? { url, title } : l))
      );
    } catch {
      // leave title as null — bare URL fallback handled in render
    }
  });
}, [parsedTasks.length]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Render the links panel in the parsed tasks block**

Find the parsed tasks block in the JSX (search for `{parsedTasks.length > 0 && (`). Inside that block, after the `<h3>AI found...</h3>` header and before the tasks list, add:

```typescript
{enrichedLinks.length > 0 && (
  <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 px-3 py-2">
    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5">Links detected</p>
    <div className="space-y-1">
      {enrichedLinks.map(({ url, title }) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
        >
          {title ?? url}
        </a>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Manual test**

In the brain dump textarea, type something containing a URL, e.g.:
`Check out this resource https://www.nytimes.com and book a meeting`

Click "Convert to tasks". After the AI results appear, verify:
- A "Links detected" panel appears above the task list
- The URL shows the page title as a clickable link ("The New York Times")
- Clicking the link opens in a new tab
- If the URL is unreachable, the bare URL appears as a fallback link

- [ ] **Step 6: Commit**

```bash
git add app/daily/page.tsx
git commit -m "feat: enrich brain dump URLs with page titles after AI parsing"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `/lists` page with two side-by-side columns
- ✅ Movies & Shows column with OMDB search + autopopulate
- ✅ Books column with Google Books search + autopopulate
- ✅ Fields: title, genre, rating (rtScore / avgRating), year/authors, poster/thumbnail
- ✅ Unchecked/checked status with strikethrough + bottom ordering
- ✅ Delete button on hover
- ✅ "Lists" nav item with Bookmark icon
- ✅ WatchItem + ReadItem Prisma models
- ✅ 4 API route pairs (GET/POST + PATCH/DELETE for each)
- ✅ Brain dump URL detection + server-side title fetch
- ✅ HTTPS-only validation on fetch-title route
- ✅ 2-second timeout on fetch-title
- ✅ Fallback to bare URL if title fetch fails

**Placeholder scan:** None found.

**Type consistency:** `WatchItem`/`ReadItem` types defined in their respective components match the Prisma model field names. `rtScore: Int?` maps to `rtScore: number | null` in TS. `avgRating: Float?` maps to `avgRating: number | null`. Route handler field names match POST body destructuring.
