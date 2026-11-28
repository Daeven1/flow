import type { SavedSession } from "./session";
import { PENDING_KEY, STORAGE_KEY, parsePending, parseSaved } from "./storage";

export const OWNER_HEADER = "X-Grove-Focus-Owner";

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // Keep running in memory if browser storage is unavailable.
  }
}

export class AccountFocusStorage {
  constructor(readonly owner: string) {}

  readSession() { return parseSaved(read(`${STORAGE_KEY}:${this.owner}`)); }
  save(session: SavedSession | null) { return write(`${STORAGE_KEY}:${this.owner}`, session); }
  readPending() { return parsePending(read(`${PENDING_KEY}:${this.owner}`)); }
  writePending(list: SavedSession[]) { return write(`${PENDING_KEY}:${this.owner}`, list.length ? list : null); }
  addPending(session: SavedSession) {
    return this.writePending([...this.readPending().filter(s => s.startedAt !== session.startedAt), session]);
  }

  // Earlier releases used shared keys. Move only records that the server can
  // attribute to this account. Unverified records can be claimed on a later visit.
  async recoverLegacy(signal: AbortSignal) {
    const session = parseSaved(read(STORAGE_KEY));
    const pending = parsePending(read(PENDING_KEY));
    const candidates = session ? [session, ...pending] : pending;
    if (!candidates.length) return;
    const request = new AbortController();
    const cancel = () => request.abort();
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    const timeout = setTimeout(cancel, 5000);
    try {
      const res = await fetch("/api/focus/recover", {
        method: "POST", redirect: "error", signal: request.signal,
        headers: { "Content-Type": "application/json", [OWNER_HEADER]: this.owner },
        body: JSON.stringify(candidates.map(({ id, startedAt, taskIds }) => ({ id, startedAt, taskIds }))),
      });
      if (!res.ok) return;
      const result = await res.json();
      if (request.signal.aborted || !Array.isArray(result.owned)) return;
      const owned = new Set(result.owned);
      // Another tab might have migrated or updated these records while we waited.
      const current = parseSaved(read(STORAGE_KEY));
      if (current && current.startedAt === session?.startedAt && owned.has(current.startedAt)) {
        const scoped = this.readSession();
        if (!scoped && this.save(current) || scoped?.startedAt === current.startedAt) write(STORAGE_KEY, null);
        else if (scoped && current.ended && (current.ended.synced || this.addPending(current))) write(STORAGE_KEY, null);
      }
      const stillPending = parsePending(read(PENDING_KEY));
      const moving = stillPending.filter(entry => owned.has(entry.startedAt));
      if (!moving.length) return;
      const merged = new Map(this.readPending().map(entry => [entry.startedAt, entry]));
      for (const entry of moving) if (!merged.has(entry.startedAt)) merged.set(entry.startedAt, entry);
      if (this.writePending([...merged.values()])) {
        const rest = stillPending.filter(entry => !owned.has(entry.startedAt));
        write(PENDING_KEY, rest.length ? rest : null);
      }
    } catch {
      // Leave the original keys intact if offline or the account changes.
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }
}
