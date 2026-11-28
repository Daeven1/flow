import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountFocusStorage, OWNER_HEADER } from "./accountStorage";
import type { SavedSession } from "./session";
import { PENDING_KEY, STORAGE_KEY } from "./storage";

const saved: SavedSession = { id: null, startedAt: 80_000, plannedMinutes: 25, rule: "STRICT", taskIds: ["fixture"], ticks: [], hiddenAt: null, ended: null, plant: null };
const ended: SavedSession = { ...saved, startedAt: 40_000, ended: { outcome: "CLEARED", at: 50_000, synced: false } };
const store = new AccountFocusStorage("a");
const signal = () => new AbortController().signal;

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => items.set(k, v), removeItem: (k: string) => items.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps each account’s live timer and unsent ends separate", async () => {
  store.save(saved);
  store.addPending(ended);
  const other = new AccountFocusStorage("b");
  expect(other.readSession()).toBeNull();
  expect(other.readPending()).toEqual([]);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await store.recoverLegacy(signal());
  expect(fetch).not.toHaveBeenCalled();
});

it("moves verified legacy saves, preserves others and does not overwrite scoped progress", async () => {
  const other = { ...ended, startedAt: 100 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  localStorage.setItem(PENDING_KEY, JSON.stringify([ended, other]));
  const fetch = vi.fn(async () => Response.json({ owned: [saved.startedAt, ended.startedAt] })); vi.stubGlobal("fetch", fetch);
  await store.recoverLegacy(signal());
  expect(fetch).toHaveBeenCalledWith("/api/focus/recover", expect.objectContaining({ headers: expect.objectContaining({ [OWNER_HEADER]: "a" }) }));
  expect(store.readSession()).toEqual(saved);
  expect(store.readPending()).toEqual([ended]);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(JSON.parse(localStorage.getItem(PENDING_KEY)!)).toEqual([other]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ended));
  await store.recoverLegacy(signal());
  expect(store.readSession()).toEqual(saved);
  expect(store.readPending()).toEqual([ended]);
});

it("retains old saves when offline, verification fails, an account changes or storage is full", async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  for (const fetch of [vi.fn().mockRejectedValue(new Error("offline")), async () => new Response(null, {status: 401}), async () => Response.json({owned: []})]) {
    vi.stubGlobal("fetch", fetch);
    await store.recoverLegacy(signal());
    expect(store.readSession()).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(saved);
  }
  vi.stubGlobal("fetch", async () => Response.json({ owned: [saved.startedAt] }));
  const controller = new AbortController();
  const checking = store.recoverLegacy(controller.signal); controller.abort(); await checking;
  expect(store.readSession()).toBeNull();
  localStorage.setItem = () => {throw new Error("full");};
  await store.recoverLegacy(signal());
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(saved);
});
