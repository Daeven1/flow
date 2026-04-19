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
      .then((r) => { if (!r.ok) return []; return r.json(); })
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      if (!BOOKS_KEY) { setSearching(false); return; }
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
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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
      if (res.ok) {
        const item = await res.json();
        setItems((prev) => [...prev, item]);
      }
    } finally {
      setAdding(null);
    }
  }

  async function toggleChecked(item: ReadItem) {
    const updated = { ...item, checked: !item.checked };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    try {
      const res = await fetch(`/api/lists/read/${item.id}`, {
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
        {results.length === 0 && !searching && query.trim() && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-400 dark:text-zinc-500">
            No results found
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
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-all text-slate-300 dark:text-zinc-600 hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
