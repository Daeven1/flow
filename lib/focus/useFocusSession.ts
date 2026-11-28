"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlantChoice } from "@/lib/grove/layout";
import {
  BREAK_MS,
  judge,
  segments,
  type FocusRule,
  type PlannedMinutes,
  type PlantDropped,
  type SavedPlant,
  type SavedSession,
} from "./session";
import { droppedReason, shouldRetry } from "./storage";
import { AccountFocusStorage, OWNER_HEADER } from "./accountStorage";

export type FocusSessionApi = {
  owner: string;
  ready: boolean; // false until localStorage has been read
  session: SavedSession | null;
  now: number; // ticks about once a second while running
  wakeLockOk: boolean | null; // null = not requested; false = unsupported or refused
  endsSynced: number; // goes up each time an end reaches the server (this session's or a pending one)
  plantsDropped: number[]; // startedAt of each session whose plant the server turned down (this page load)
  start(input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[]; plant: SavedPlant | null }): void;
  tick(taskId: string): boolean; // true when accepted, including the last task
  giveUp(): void; // ends as GAVE_UP
  startBreak(): void; // once per successful session, survives a reload
  clear(): void; // forget an ended session
};

type WakeLockSentinelLike = { release(): Promise<void> };

type PushResult = {
  id: string | null; // the server id, if we have one now
  startRejected: boolean; // the start POST got a 4xx and can never succeed
  endDone: boolean; // the end no longer needs sending (sent, or can never succeed)
  endSaved: boolean; // the end PATCH succeeded just now
  plantDropped: PlantDropped | null; // why the start POST just answered plantAccepted: false
};

// What the server is sent: the choice alone, never the saved stage.
function toChoice(p: SavedPlant | null): PlantChoice | null {
  if (!p) return null;
  return p.tendId !== undefined
    ? { species: p.species, x: p.x, y: p.y, tendId: p.tendId }
    : { species: p.species, x: p.x, y: p.y };
}

/** The session as a plain one, after the server turned its plant down. */
function withoutPlant(s: SavedSession, why: PlantDropped): SavedSession {
  if (!s.plant) return s;
  return { ...s, plant: null, plantDropped: why };
}

// One server round for a session: start first if it has no id, then the end.
// Never throws; network errors and 5xx leave things for a later retry.
async function push(s: SavedSession, skipStart: boolean, owner: string, signal: AbortSignal): Promise<PushResult> {
  const headers = { "Content-Type": "application/json", [OWNER_HEADER]: owner };
  let id = s.id;
  let plantDropped: PlantDropped | null = null;
  const none = { endSaved: false, plantDropped: null };
  try {
    if (id === null) {
      if (skipStart) return { id, startRejected: true, endDone: !!s.ended, ...none };
      const res = await fetch("/api/focus/sessions", {
        method: "POST",
        headers, signal, redirect: "error",
        body: JSON.stringify({
          startedAt: new Date(s.startedAt).toISOString(),
          plannedMinutes: s.plannedMinutes,
          rule: s.rule,
          taskIds: s.taskIds,
          plant: toChoice(s.plant),
        }),
      });
      if (res.status >= 400 && res.status < 500 && !shouldRetry(res.status)) {
        return { id, startRejected: true, endDone: !!s.ended, ...none };
      }
      if (!res.ok) return { id, startRejected: false, endDone: false, ...none };
      const body = (await res.json()) as { id?: unknown; plantAccepted?: unknown; dropReason?: unknown };
      if (typeof body.id !== "string") return { id, startRejected: false, endDone: false, ...none };
      id = body.id;
      plantDropped = droppedReason(s.plant, body);
    }
    const ended = s.ended;
    if (!ended) return { id, startRejected: false, endDone: false, endSaved: false, plantDropped };
    const res = await fetch(`/api/focus/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers, signal, redirect: "error",
      body: JSON.stringify({
        outcome: ended.outcome,
        endedAt: new Date(ended.at).toISOString(),
        segments: segments(s, ended.at),
        tz: new Date().getTimezoneOffset(), // for the withered-plant cutoff
      }),
    });
    // 400/404 can never succeed, so stop retrying; 5xx may recover later.
    const done = res.ok || res.status === 400 || res.status === 404;
    if (res.ok && !signal.aborted && (ended.outcome === "COMPLETED" || ended.outcome === "CLEARED")) {
      window.dispatchEvent(new Event("grove:focus-time-saved"));
    }
    return { id, startRejected: false, endDone: done, endSaved: res.ok, plantDropped };
  } catch {
    return { id, startRejected: false, endDone: false, endSaved: false, plantDropped };
  }
}

// Ends the session if judge says it is over. Same object back when nothing changes.
function applyJudge(s: SavedSession, now: number): SavedSession {
  if (s.ended) return s;
  const verdict = judge(s, now);
  if (!verdict) return s;
  return { ...s, ended: { outcome: verdict.outcome, at: verdict.at, synced: false } };
}

export function useFocusSession(owner: string): FocusSessionApi {
  const storage = useMemo(() => new AccountFocusStorage(owner), [owner]);
  const lifetime = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SavedSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wakeLockOk, setWakeLockOk] = useState<boolean | null>(null);
  const [endsSynced, setEndsSynced] = useState(0);
  const [plantsDropped, setPlantsDropped] = useState<number[]>([]);
  const noteDropped = useCallback((startedAt: number) => {
    setPlantsDropped((list) => (list.includes(startedAt) ? list : [...list, startedAt]));
  }, []);

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
    storage.save(next);
  }, [storage]);

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
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || flushing.current) return;
    const list = storage.readPending();
    if (list.length === 0) return;
    flushing.current = true;
    try {
      const keep: SavedSession[] = [];
      let saved = 0;
      for (const entry of list) {
        const r = await push(entry, false, owner, signal);
        if (signal.aborted) return;
        if (r.endSaved) saved++;
        if (r.plantDropped) noteDropped(entry.startedAt);
        if (r.endDone) continue; // sent, or can never succeed (including a rejected start)
        let next = r.id !== entry.id ? { ...entry, id: r.id } : entry;
        if (r.plantDropped) next = withoutPlant(next, r.plantDropped);
        keep.push(next);
      }
      // entries added by clear() while we were busy stay too
      const done = new Set(list.map((e) => e.startedAt));
      const added = storage.readPending().filter((e) => !done.has(e.startedAt));
      storage.writePending([...keep, ...added]);
      if (saved > 0) setEndsSynced((c) => c + saved);
    } finally {
      flushing.current = false;
    }
  }, [noteDropped, owner, storage]);

  // Server sync for the current session. Never awaited by the UI.
  const sync = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    if (syncing.current) {
      syncDirty.current = true; // something changed mid-flight: go round once more
      return;
    }
    const s = ref.current;
    if (!s) return;
    if (s.ended?.synced || (s.id !== null && !s.ended)) return;
    syncing.current = true;
    try {
      const skipStart = rejectedStart.current === s.startedAt;
      const r = await push(s, skipStart, owner, signal);
      if (signal.aborted) return;
      if (r.startRejected) rejectedStart.current = s.startedAt;
      if (r.endSaved) setEndsSynced((c) => c + 1);
      if (r.plantDropped) noteDropped(s.startedAt);

      if (ref.current?.startedAt !== s.startedAt) {
        // the session was moved to the pending list while we were talking to the
        // server: keep what we learned (the id), or drop the entry if it is done
        const rest = storage.readPending().filter((e) => e.startedAt !== s.startedAt);
        const entry = storage.readPending().find((e) => e.startedAt === s.startedAt);
        if (entry && !r.endDone) {
          const next = r.id !== null ? { ...entry, id: r.id } : entry;
          rest.push(r.plantDropped ? withoutPlant(next, r.plantDropped) : next);
        }
        storage.writePending(rest);
        return;
      }
      patch(s.startedAt, (c) => {
        let next = c;
        if (r.id !== null && c.id !== r.id) next = { ...next, id: r.id };
        if (r.plantDropped) next = withoutPlant(next, r.plantDropped);
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
      }
      if (!syncing.current && flushWanted.current) {
        flushWanted.current = false;
        void flushPending();
      }
    }
  }, [patch, flushPending, noteDropped, owner, storage]);

  const requestFlush = useCallback(() => {
    // An outstanding start may have just moved to pending. Wait for its ID.
    if (syncing.current) flushWanted.current = true;
    else void flushPending();
  }, [flushPending]);

  const syncAll = useCallback(() => {
    void sync();
    requestFlush();
  }, [sync, requestFlush]);

  const running = !!session && !session.ended;
  const strictRunning = running && session?.rule === "STRICT";
  const startedAt = session?.startedAt;
  const endedFlag = !!session?.ended;
  const onBreak = session?.breakEndsAt !== undefined && now < session.breakEndsAt;

  // Judge saved deadlines before displaying a timer, including a Strict return
  // after the browser was suspended. A visible Grove route is still in the app.
  const restore = useCallback(() => {
    const saved = storage.readSession();
    const t = Date.now();
    if (saved) {
      let next = applyJudge(saved, t);
      if (!next.ended) {
        const hiddenAt = document.visibilityState === "hidden" ? next.hiddenAt ?? t : null;
        if (hiddenAt !== next.hiddenAt) next = { ...next, hiddenAt };
      }
      ref.current = next;
      setSession(next);
      if (next !== saved) storage.save(next);
    }
    setNow(t);
  }, [storage]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let recovering = false;
    const recover = async () => {
      if (recovering) return;
      recovering = true;
      await storage.recoverLegacy(controller.signal);
      recovering = false;
      if (controller.signal.aborted) return;
      if (!ref.current) restore();
      setReady(true);
      // The session effect sends a restored start/end once. Retried offline
      // requests use the usual online/visibility listeners.
      requestFlush();
    };
    if (storage.readSession()) {
      restore();
      setReady(true);
    }
    void recover();
    window.addEventListener("online", recover);
    return () => {
      controller.abort();
      const current = ref.current;
      if (current && !current.ended && current.hiddenAt === null) {
        storage.save({ ...current, hiddenAt: Date.now() });
      }
      window.removeEventListener("online", recover);
    };
  }, [storage, restore, requestFlush]);

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
    window.addEventListener("pageshow", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHidden);
      window.removeEventListener("pageshow", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [commit, syncAll]);

  // While running: tick the clock about once a second and let judge decide.
  useEffect(() => {
    if ((!running && !onBreak) || startedAt === undefined) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const s = ref.current;
      if (!s) return;
      const next = applyJudge(s, t);
      if (next !== s) commit(next);
    }, 1000);
    return () => clearInterval(id);
  }, [running, onBreak, startedAt, commit]);

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
  }, [startedAt, endedFlag, sync]);

  const start = useCallback<FocusSessionApi["start"]>(
    ({ plannedMinutes, rule, taskIds, plant }) => {
      const cur = ref.current;
      if (cur && !cur.ended) return;
      if (taskIds.length === 0) return;
      if (cur?.ended && !cur.ended.synced) {
        // never overwrite an unsent end: park it in the pending list
        storage.addPending(cur);
        requestFlush();
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
        plant,
      });
    },
    [commit, requestFlush, storage],
  );

  const tick = useCallback<FocusSessionApi["tick"]>(
    (taskId) => {
      const s = ref.current;
      if (!s || s.ended) return false;
      const t = Date.now();

      // A tick landing after the end time ends the session instead of recording.
      const judged = applyJudge(s, t);
      if (judged !== s) {
        commit(judged);
        return false;
      }
      if (!s.taskIds.includes(taskId) || s.ticks.some((x) => x.taskId === taskId)) return false;

      const withTick = { ...s, ticks: [...s.ticks, { taskId, at: t }] };
      commit(applyJudge(withTick, t));
      return true;
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

  const startBreak = useCallback(() => {
    const s = ref.current;
    if (!s || s.breakEndsAt !== undefined) return;
    if (s.ended?.outcome !== "COMPLETED" && s.ended?.outcome !== "CLEARED") return;
    const t = Date.now();
    setNow(t);
    commit({ ...s, breakEndsAt: t + BREAK_MS });
  }, [commit]);

  const clear = useCallback(() => {
    const s = ref.current;
    if (!s || !s.ended) return;
    if (!s.ended.synced) {
      // keep the unsent end so it still reaches the server
      storage.addPending(s);
    }
    commit(null);
    // a sync in flight may still be creating this session's server id: let it finish first
    requestFlush();
  }, [commit, requestFlush, storage]);

  return { owner, ready, session, now, wakeLockOk, endsSynced, plantsDropped, start, tick, giveUp, startBreak, clear };
}
