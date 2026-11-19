"use client";

import { useCallback, useState } from "react";
import { StickyPile } from "@/components/StickyPile";
import { Grove, type Growing } from "@/components/grove/Grove";
import type { GrovePlant } from "@/lib/grove/layout";
import type { GroveStatus } from "@/lib/grove/useGrove";
import { NO_WEBGL_LINE, OnFallback, plantCount, speciesName } from "@/components/focus/groveText";
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
  plants: GrovePlant[]; // the grove as it stands, without this session's plant
  groveStatus: GroveStatus;
  onComplete: (taskId: string) => void; // ticks one task off
  onGiveUp: () => void;
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

export function SessionView({ session, now, wakeLockOk, tasks, plants, groveStatus, onComplete, onGiveUp }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const onNoWebGL = useCallback(() => setNoWebGL(true), []);

  const left = remainingMs(session, now);
  const minutesLeft = Math.ceil(left / 60_000);
  const p = progress(session, now);

  // Ticked tasks first (in the order they were ticked), then the rest in queue order.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const tickedIds = session.ticks.map((t) => t.taskId);
  const ordered = [
    ...tickedIds.map((id) => byId.get(id)).filter((t): t is PileTask => t !== undefined),
    ...tasks.filter((t) => !tickedIds.includes(t.id)),
  ];

  const plant = session.plant;
  const growing: Growing | null = plant
    ? { species: plant.species, spot: { x: plant.x, y: plant.y }, progress: p, outcome: null }
    : null;
  // Side by side at lg only when the grove is drawn; the plain bar keeps piece 1's stack.
  const withGrove = growing !== null && !noWebGL;
  const wakeWarning = session.rule === "STRICT" && wakeLockOk === false;

  const bar = (
    <div className="w-full flex flex-col items-center gap-2 py-2">
      <FocusVisual progress={p} outcome={null} />
      {growing && <p className="text-sm text-slate-600 dark:text-zinc-400 text-center">{NO_WEBGL_LINE}</p>}
    </div>
  );

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${
        withGrove ? "lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:items-center" : "justify-items-center"
      }`}
    >
      <div className="w-full flex flex-col items-center gap-1">
        {growing ? (
          <Grove
            plants={plants}
            growing={growing}
            label={`Your ${speciesName(growing.species, true)} ${
              growing.species === "FERN" ? "is" : "are"
            } growing.${groveStatus === "failed" ? "" : ` ${plantCount(plants.length)} in your grove`}`}
            className={`w-full ${wakeWarning ? "h-[30svh]" : "h-[38svh]"} min-h-[180px] lg:h-[min(calc(100svh_-_240px),560px)] lg:min-h-[320px]`}
            fallback={
              <>
                <OnFallback onShow={onNoWebGL} />
                {bar}
              </>
            }
          />
        ) : (
          bar
        )}
        {growing && !noWebGL && groveStatus === "failed" && (
          <p className="text-sm text-slate-600 dark:text-zinc-400 text-center">
            Your grove couldn&apos;t load just now. Your plants are safe.
          </p>
        )}
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

      <div className="w-full max-w-[480px] mx-auto flex flex-col items-center gap-3">
        {wakeWarning && (
          <p className="w-full text-sm text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            This phone can&apos;t be kept awake from here, so keep the screen from locking yourself.
          </p>
        )}

        <StickyPile
          tasks={ordered}
          initialIndex={tickedIds.length}
          onComplete={onComplete}
          onCleared={() => {}}
          compact
        />

        {confirming ? (
          <div role="group" aria-label="Give up this session" className="flex flex-col items-center gap-2">
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
            className={`min-h-[44px] px-3 text-sm font-medium rounded-lg text-slate-600 dark:text-zinc-400 underline-offset-4 hover:underline hover:text-slate-900 dark:hover:text-white ${focusRing}`}
          >
            Give up
          </button>
        )}
      </div>
    </div>
  );
}
