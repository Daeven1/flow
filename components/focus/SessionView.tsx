"use client";

import { useState } from "react";
import { StickyPile } from "@/components/StickyPile";
import {
  formatClock,
  progress,
  remainingMs,
  type Outcome,
  type SavedSession,
} from "@/lib/focus/session";

export type PileTask = {
  id: string;
  name: string;
  sprint?: number;
  estMinutes?: number;
};

// The one slot piece 2 replaces with the grove. Keep its props as they are.
export function FocusVisual({ progress, outcome }: { progress: number; outcome: Outcome | null }) {
  void outcome;
  const pct = Math.round(progress * 100);
  return (
    <div
      role="progressbar"
      aria-label="Session progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="w-full max-w-md h-3 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden"
    >
      <div
        className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type Props = {
  session: SavedSession;
  now: number;
  wakeLockOk: boolean | null;
  tasks: PileTask[]; // every task in the session, in queue order
  onComplete: (taskId: string) => void; // ticks one task off
  onGiveUp: () => void;
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

export function SessionView({ session, now, wakeLockOk, tasks, onComplete, onGiveUp }: Props) {
  const [confirming, setConfirming] = useState(false);

  const left = remainingMs(session, now);
  const minutesLeft = Math.ceil(left / 60_000);

  // Ticked tasks first (in the order they were ticked), then the rest in queue order.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const tickedIds = session.ticks.map((t) => t.taskId);
  const ordered = [
    ...tickedIds.map((id) => byId.get(id)).filter((t): t is PileTask => t !== undefined),
    ...tasks.filter((t) => !tickedIds.includes(t.id)),
  ];

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-full flex flex-col items-center gap-2">
        <FocusVisual progress={progress(session, now)} outcome={null} />
        <div
          aria-live="off"
          className="text-sm tabular-nums text-slate-600 dark:text-zinc-400"
        >
          {formatClock(left)} left
        </div>
        <div className="sr-only" aria-live="polite" role="status">
          {minutesLeft} {minutesLeft === 1 ? "minute" : "minutes"} left
        </div>
      </div>

      {session.rule === "STRICT" && wakeLockOk === false && (
        <p className="max-w-md text-sm text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          This phone can&apos;t be kept awake from here, so keep the screen from locking yourself.
        </p>
      )}

      <StickyPile
        tasks={ordered}
        initialIndex={tickedIds.length}
        onComplete={onComplete}
        onCleared={() => {}}
      />

      <div className="flex flex-col items-center gap-3">
        {confirming ? (
          <div role="group" aria-label="Give up this session" className="flex flex-col items-center gap-3">
            <p className="text-sm text-slate-700 dark:text-zinc-300">
              Really give up? This session will be lost.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onGiveUp}
                className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors ${focusRing}`}
              >
                Yes, give up
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirming(false)}
                className={`min-h-[44px] px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors ${focusRing}`}
              >
                Keep going
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors ${focusRing}`}
          >
            Give up
          </button>
        )}
      </div>
    </div>
  );
}
