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
      .then((r) => { if (!r.ok) return []; return r.json(); })
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      if (!OMDB_KEY) { setSearching(false); return; }
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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
      const rtScore = rtRating ? parseInt(rtRating.Value, 10) : null;

      const res = await fetch("/api/lists/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.Title,
          year: result.Year,
          genre: detail.Genre ?? "",
          rtScore: typeof rtScore === "number" && !isNaN(rtScore) ? rtScore : null,
          poster: result.Poster !== "N/A" ? result.Poster : null,
        }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems((prev) => [...prev, item]);
      }
    } finally {
      setAdding(null);
    }
  }

  async function toggleChecked(item: WatchItem) {
    const updated = { ...item, checked: !item.checked };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    try {
      const res = await fetch(`/api/lists/watch/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: updated.checked }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    }
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
          </div>
        )}
        {results.length === 0 && !searching && query.trim() && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-400 dark:text-zinc-500">
            No results found
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
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-all text-slate-300 dark:text-zinc-600 hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
