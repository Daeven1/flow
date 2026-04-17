# Design: Lists Page & Brain Dump Hyperlinks

Date: 2026-04-17

---

## Feature 1: Lists Page

### Overview

A new `/lists` route added to the main nav ("Lists"). Displays two side-by-side columns: **Movies & Shows** (left) and **Books** (right). Items are added via search-and-autopopulate from external APIs, and can be checked off when done.

### Navigation

- New entry in `NAV_ITEMS` in `components/Nav.tsx`
- Label: "Lists", icon: `Bookmark` (lucide-react)
- Route: `/app/lists/page.tsx`

### Page Layout

Two equal columns within the existing `max-w-5xl` container:

**Movies & Shows column (left)**
- Search input at top; debounced query hits OMDB API client-side
- Dropdown shows up to 5 results: poster thumbnail, title, year
- Selecting a result adds item to the list with fields pre-filled
- List items show: checkbox, title, genre tag, RT score badge, year, delete button
- Checked items move to bottom with strikethrough styling

**Books column (right)**
- Same UX pattern, querying Google Books API client-side
- Dropdown shows: thumbnail, title, author(s)
- List items show: checkbox, title, genre/category tag, avg rating badge, author, delete button
- Checked items move to bottom with strikethrough styling

### Data Model

Two new Prisma models:

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

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/lists/watch` | Fetch all watch items for user |
| POST | `/api/lists/watch` | Add a new watch item |
| PATCH | `/api/lists/watch/[id]` | Toggle checked / update fields |
| DELETE | `/api/lists/watch/[id]` | Delete a watch item |
| GET | `/api/lists/read` | Fetch all read items for user |
| POST | `/api/lists/read` | Add a new read item |
| PATCH | `/api/lists/read/[id]` | Toggle checked / update fields |
| DELETE | `/api/lists/read/[id]` | Delete a read item |

### External APIs

- **OMDB API** (`http://www.omdbapi.com/`) — movie/show search and metadata (title, year, genre, Rotten Tomatoes score, poster). Requires `OMDB_API_KEY` env var.
- **Google Books API** (`https://www.googleapis.com/books/v1/volumes`) — book search and metadata (title, authors, categories, average rating, thumbnail). Requires `GOOGLE_BOOKS_API_KEY` env var.
- Both APIs are called client-side. No server proxy needed.

### Error Handling

- If OMDB or Google Books returns no results, show "No results found" in the dropdown.
- If a fetch fails, show a subtle error state in the search input.
- If RT score or rating is unavailable, omit the badge rather than showing 0.
- Poster/thumbnail fallback: placeholder icon if image URL is missing or fails to load.

---

## Feature 2: Brain Dump Hyperlink Enrichment

### Overview

After the AI processes a brain dump, any URLs in the output are detected and converted to clickable hyperlinks labelled with the page's `<title>`. This is a post-processing step on the rendered output and does not change the AI parsing logic.

### Flow

1. AI response is received as text in the brain dump UI
2. A regex scans the text for URLs (`https?://...`)
3. For each URL found, a request is made to `/api/fetch-title?url=<encoded-url>`
4. The server fetches the page HTML and extracts the `<title>` tag
5. The URL in the rendered output is replaced with `<a href="url" target="_blank" rel="noopener noreferrer">Page Title</a>`
6. If the fetch fails, times out (2s timeout), or returns no title, the bare URL is rendered as a plain link: `<a href="url">url</a>`

### API Route

**`GET /api/fetch-title?url=<encoded-url>`**

- Fetches the target URL server-side (avoids CORS)
- Parses `<title>` from the HTML response
- Returns `{ title: string | null }`
- 2-second timeout; returns `{ title: null }` on failure

### Security

- The route validates that `url` is a well-formed `https://` URL before fetching
- Does not follow redirects to non-https targets
- Response is text only — no HTML is passed back to the client

---

## Out of Scope

- Sorting or filtering the lists (by genre, rating, etc.) — can be added later
- Common Sense Media age ratings — no public API available
- Sharing lists with other users
- Import/export
