"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  judge,
  segments,
  type FocusRule,
  type PlannedMinutes,
  type SavedSession,
} from "./session";
import { PENDING_KEY, STORAGE_KEY, parsePending, parseSaved, shouldRetry } from "./storage";

export type FocusSessionApi = {
  ready: boolean; // false until localStorage has been read
  session: SavedSession | null;
  now: number; // ticks about once a second while running
  wakeLockOk: boolean | null; // null = not requested; false = unsupported or refused
  start(input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[] }): void;
  tick(taskId: string): void; // records the tick; ends as CLEARED if it was the last
  giveUp(): void; // ends as GAVE_UP
  clear(): void; // forget an ended session
};

type WakeLockSentinelLike = { release(): Promise<void> };

function save(s: SavedSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode or storage full: the session still runs in memory
  }
}

function readPending(): SavedSession[] {
  try {
    return parsePending(localStorage.getItem(PENDING_KEY));
  } catch {
    return [];
  }
}

function addPending(s: SavedSession) {
  writePending([...readPending().filter((e) => e.startedAt !== s.startedAt), s]);
}

function writePending(list: SavedSession[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // storage unavailable: nothing more we can do
  }
}

type PushResult = {
  id: string | null; // the server id, if we have one now
  startRejected: boolean; // the start POST got a 4xx and can never succeed
  endDone: boolean; // the end no longer needs sending (sent, or can never succeed)
};

// One server round for a session: start first if it has no id, then the end.
// Never throws; network errors and 5xx leave things for a later retry.
async function push(s: SavedSession, skipStart: boolean): Promise<PushResult> {
  let id = s.id;
  try {
    if (id === null) {
      if (skipStart) return { id, startRejected: true, endDone: !!s.ended };
      const res = await fetch("/api/focus/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: new Date(s.startedAt).toISOString(),
          plannedMinutes: s.plannedMinutes,
          rule: s.rule,
          taskIds: s.taskIds,
        }),
      });
      if (res.status >= 400 && res.status < 500 && !shouldRetry(res.status)) {
        return { id, startRejected: true, endDone: !!s.ended };
      }
      if (!res.ok) return { id, startRejected: false, endDone: false };
      const body = (await res.json()) as { id?: unknown };
      if (typeof body.id !== "string") return { id, startRejected: false, endDone: false };
      id = body.id;
    }
    const ended = s.ended;
    if (!ended) return { id, startRejected: false, endDone: false };
    const res = await fetch(`/api/focus/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: ended.outcome,
        endedAt: new Date(ended.at).toISOString(),
        segments: segments(s, ended.at),
      }),
    });
    // 400/404 can never succeed, so stop retrying; 5xx may recover later.
    const done = res.ok || res.status === 400 || res.status === 404;
    return { id, startRejected: false, endDone: done };
  } catch {
    return { id, startRejected: false, endDone: false };
  }
}

// Ends the session if judge says it is over. Same object back when nothing changes.
function applyJudge(s: SavedSession, now: number): SavedSession {
  if (s.ended) return s;
  const verdict = judge(s, now);
  if (!verdict) return s;
  return { ...s, ended: { outcome: verdict.outcome, at: verdict.at, synced: false } };
}

export function useFocusSession(): FocusSessionApi {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SavedSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wakeLockOk, setWakeLockOk] = useState<boolean | null>(null);

  // The ref is the latest truth, so event handlers never see stale state.
  const ref = useRef<SavedSession | null>(null);
  const syncing = useRef(false);
  const flushing = useRef(false);
  const syncDirty = useRef(false);
  const flushWanted = useRef(false); // a flush was held back while a sync was in flight
  const rejectedStart = useRef<number | null>(null); // startedAt of a session whose start got a 4xx

  const commit = useCallback((next: SavedSession | null) => {
    ref.current = next;
    setSession(next);
    save(next);
  }, []);

  // Applies a change to the current session, if it is still the one we started with.
  const patch = useCallback(
    (startedAt: number, change: (s: SavedSession) => SavedSession) => {
      const cur = ref.current;
      if (!cur || cur.startedAt !== startedAt) return;
      const next = change(cur);
      if (next !== cur) commit(next);
    },
    [commit],
  );

  // Ended sessions that were cleared before they reached the server.
  const flushPending = useCallback(async () => {
    if (flushing.current) return;
    const list = readPending();
    if (list.length === 0) return;
    flushing.current = true;
    try {
      const keep: SavedSession[] = [];
      for (const entry of list) {
        const r = await push(entry, false);
        if (r.endDone) continue; // sent, or can never succeed (including a rejected start)
        keep.push(r.id !== entry.id ? { ...entry, id: r.id } : entry);
      }
      // entries added by clear() while we were busy stay too
      const done = new Set(list.map((e) => e.startedAt));
      const added = readPending().filter((e) => !done.has(e.startedAt));
      writePending([...keep, ...added]);
    } finally {
      flushing.current = false;
    }
  }, []);

  // Server sync for the current session. Never awaited by the UI.
  const sync = useCallback(async () => {
    if (syncing.current) {
      syncDirty.current = true; // something changed mid-flight: go round once more
      return;
    }
    const s = ref.current;
    if (!s) return;
    if (s.ended?.synced) return;
    syncing.current = true;
    try {
      const skipStart = rejectedStart.current === s.startedAt;
      const r = await push(s, skipStart);
      if (r.startRejected) rejectedStart.current = s.startedAt;

      if (ref.current?.startedAt !== s.startedAt) {
        // the session was moved to the pending list while we were talking to the
        // server: keep what we learned (the id), or drop the entry if it is done
        const rest = readPending().filter((e) => e.startedAt !== s.startedAt);
        const entry = readPending().find((e) => e.startedAt === s.startedAt);
        if (entry && !r.endDone) rest.push(r.id !== null ? { ...entry, id: r.id } : entry);
        writePending(rest);
        return;
      }
      patch(s.startedAt, (c) => {
        let next = c;
        if (r.id !== null && c.id !== r.id) next = { ...next, id: r.id };
        // the end may have happened while the request was in flight: only trust it
        // if what we sent was the same end
        if (r.endDone && s.ended && next.ended && !next.ended.synced && next.ended.at === s.ended.at) {
          next = { ...next, ended: { ...next.ended, synced: true } };
        }
        return next;
      });
    } finally {
      syncing.current = false;
      if (syncDirty.current) {
        syncDirty.current = false;
        void sync();
      } else if (flushWanted.current) {
        flushWanted.current = false;
        void flushPending();
      }
    }
  }, [patch, flushPending]);

  const syncAll = useCallback(() => {
    void sync();
    void flushPending();
  }, [sync, flushPending]);

  const running = !!session && !session.ended;
  const strictRunning = running && session?.rule === "STRICT";
  const startedAt = session?.startedAt;
  const sessionId = session?.id;
  const endedFlag = !!session?.ended;
  const synced = session?.ended?.synced;

  // Mount: read storage, judge it (a reload counts as time away), then sync.
  useEffect(() => {
    let saved: SavedSession | null = null;
    try {
      saved = parseSaved(localStorage.getItem(STORAGE_KEY));
    } catch {
      saved = null;
    }
    const t = Date.now();
    if (saved) {
      let next = applyJudge(saved, t);
      if (!next.ended && next.hiddenAt !== null && document.visibilityState === "visible") {
        next = { ...next, hiddenAt: null };
      }
      ref.current = next;
      setSession(next);
      if (next !== saved) save(next);
    }
    setNow(t);
    setReady(true);
    syncAll();
  }, [syncAll]);

  // Visibility, pagehide and online.
  useEffect(() => {
    const onHidden = () => {
      const s = ref.current;
      if (!s || s.ended || s.hiddenAt !== null) return;
      commit({ ...s, hiddenAt: Date.now() });
    };
    const onVisible = () => {
      const s = ref.current;
      if (s) {
        const t = Date.now();
        let next = applyJudge(s, t);
        if (!next.ended && next.hiddenAt !== null) next = { ...next, hiddenAt: null };
        if (next !== s) commit(next);
        setNow(t);
      }
      syncAll();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? onHidden() : onVisible());
    const onOnline = () => syncAll();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHidden);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHidden);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [commit, syncAll]);

  // While running: tick the clock about once a second and let judge decide.
  useEffect(() => {
    if (!running || startedAt === undefined) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const s = ref.current;
      if (!s) return;
      const next = applyJudge(s, t);
      if (next !== s) commit(next);
    }, 1000);
    return () => clearInterval(id);
  }, [running, startedAt, commit]);

  // Wake lock under the strict rule: ask now and again whenever the page is visible.
  useEffect(() => {
    if (!strictRunning) {
      setWakeLockOk(null);
      return;
    }
    let cancelled = false;
    let lock: WakeLockSentinelLike | null = null;

    const request = async () => {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
        }).wakeLock;
        if (!wl) {
          if (!cancelled) setWakeLockOk(false);
          return;
        }
        const got = await wl.request("screen");
        if (cancelled) {
          void got.release().catch(() => {});
          return;
        }
        const old = lock;
        lock = got;
        if (old && old !== got) void old.release().catch(() => {});
        setWakeLockOk(true);
      } catch {
        if (!cancelled) setWakeLockOk(false);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      const l = lock;
      lock = null;
      if (l) void l.release().catch(() => {});
    };
  }, [strictRunning, startedAt]);

  // Push to the server whenever something worth syncing changes.
  useEffect(() => {
    if (startedAt === undefined) return;
    void sync();
  }, [startedAt, sessionId, endedFlag, synced, sync]);

  const start = useCallback<FocusSessionApi["start"]>(
    ({ plannedMinutes, rule, taskIds }) => {
      const cur = ref.current;
      if (cur && !cur.ended) return;
      if (taskIds.length === 0) return;
      if (cur?.ended && !cur.ended.synced) {
        // never overwrite an unsent end: park it in the pending list
        addPending(cur);
        if (syncing.current) flushWanted.current = true;
        else void flushPending();
      }
      const t = Date.now();
      setNow(t);
      commit({
        id: null,
        startedAt: t,
        plannedMinutes,
        rule,
        taskIds: [...taskIds],
        ticks: [],
        hiddenAt: null,
        ended: null,
      });
    },
    [commit, flushPending],
  );

  const tick = useCallback<FocusSessionApi["tick"]>(
    (taskId) => {
      const s = ref.current;
      if (!s || s.ended) return;
      const t = Date.now();

      // A tick landing after the end time ends the session instead of recording.
      const judged = applyJudge(s, t);
      if (judged !== s) {
        commit(judged);
        return;
      }
      if (!s.taskIds.includes(taskId) || s.ticks.some((x) => x.taskId === taskId)) return;

      const withTick = { ...s, ticks: [...s.ticks, { taskId, at: t }] };
      commit(applyJudge(withTick, t));
    },
    [commit],
  );

  const giveUp = useCallback(() => {
    const s = ref.current;
    if (!s || s.ended) return;
    const t = Date.now();
    const judged = applyJudge(s, t);
    if (judged !== s) {
      commit(judged);
      return;
    }
    commit({ ...s, ended: { outcome: "GAVE_UP", at: t, synced: false } });
  }, [commit]);

  const clear = useCallback(() => {
    const s = ref.current;
    if (!s || !s.ended) return;
    if (!s.ended.synced) {
      // keep the unsent end so it still reaches the server
      addPending(s);
    }
    commit(null);
    // a sync in flight may still be creating this session's server id: let it finish first
    if (syncing.current) flushWanted.current = true;
    else void flushPending();
  }, [commit, flushPending]);

  return { ready, session, now, wakeLockOk, start, tick, giveUp, clear };
}
