"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  judge,
  segments,
  type FocusRule,
  type PlannedMinutes,
  type SavedSession,
} from "./session";
import { STORAGE_KEY, parseSaved } from "./storage";

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

  // Server sync. Never awaited by the UI; failures just wait for the next retry.
  const sync = useCallback(async () => {
    const s = ref.current;
    if (!s || syncing.current) return;
    if (s.ended?.synced) return;
    syncing.current = true;
    try {
      let id = s.id;
      if (id === null) {
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
        if (!res.ok) return;
        const body = (await res.json()) as { id?: unknown };
        if (typeof body.id !== "string") return;
        id = body.id;
        const gotId = id;
        patch(s.startedAt, (c) => (c.id === gotId ? c : { ...c, id: gotId }));
      }

      const latest = ref.current;
      if (!latest || latest.startedAt !== s.startedAt) return;
      const ended = latest.ended;
      if (!ended || ended.synced) return;

      const res = await fetch(`/api/focus/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: ended.outcome,
          endedAt: new Date(ended.at).toISOString(),
          segments: segments(latest, ended.at),
        }),
      });
      // 400/404 can never succeed, so stop retrying; 5xx may recover later.
      if (res.ok || res.status === 400 || res.status === 404) {
        patch(s.startedAt, (c) =>
          c.ended && !c.ended.synced ? { ...c, ended: { ...c.ended, synced: true } } : c,
        );
      }
    } catch {
      // network error: leave synced false for a later retry
    } finally {
      syncing.current = false;
    }
  }, [patch]);

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
    void sync();
  }, [sync]);

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
      void sync();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? onHidden() : onVisible());
    const onOnline = () => void sync();

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
  }, [commit, sync]);

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
    [commit],
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
    commit(null);
  }, [commit]);

  return { ready, session, now, wakeLockOk, start, tick, giveUp, clear };
}
