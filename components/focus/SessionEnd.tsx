"use client";

import { useEffect, useState } from "react";
import { formatClock, progress, type SavedSession } from "@/lib/focus/session";
import { Grove, type Growing } from "@/components/grove/Grove";
import type { GrovePlant } from "@/lib/grove/layout";
import { plantCount } from "@/components/focus/groveText";

type Props = {
  session: SavedSession; // an ended session
  plants: GrovePlant[]; // the grove as last loaded
  onNew: () => void;
};

const BREAK_MS = 5 * 60_000;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

export function SessionEnd({ session, plants, onNew }: Props) {
  const ended = session.ended;
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const [breakUsed, setBreakUsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const breakRunning = breakEnd !== null && now < breakEnd;
  useEffect(() => {
    if (!breakRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [breakRunning]);

  if (!ended) return null;

  const minutes = Math.min(
    session.plannedMinutes,
    Math.max(0, Math.round((ended.at - session.startedAt) / 60_000)),
  );
  const minutesText = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const canBreak = ended.outcome === "COMPLETED" || ended.outcome === "CLEARED";

  let message: string;
  switch (ended.outcome) {
    case "COMPLETED":
      message = minutes === 0 ? "Session complete." : `Session complete. ${minutesText} of focus.`;
      break;
    case "CLEARED":
      message =
        minutes === 0
          ? "List cleared in under a minute. Nicely done."
          : `List cleared in ${minutesText}. Nicely done.`;
      break;
    case "LEFT":
      message =
        "You stepped away from Grove, so this session didn't count. Everything else is just as you left it.";
      break;
    default:
      message = "Session ended early. Nothing else has changed.";
  }

  const plant = session.plant;
  const growing: Growing | null = plant
    ? {
        species: plant.species,
        spot: { x: plant.x, y: plant.y },
        stage: 1, // tends are wired in task 6
        progress: progress(session, ended.at),
        outcome: ended.outcome,
      }
    : null;
  // The server's copy of this plant may already be in the list (a reload on this
  // screen). On the same spot the grove draws it once; if the server had to move
  // it (the spot was taken meanwhile), leave out a same-species plant planted
  // since this session started, so it isn't drawn twice.
  const others = growing
    ? plants.filter(
        (p) =>
          !(p.x === growing.spot.x && p.y === growing.spot.y) &&
          !(p.species === growing.species && Date.parse(p.plantedAt) >= session.startedAt),
      )
    : plants;
  const total = others.length + (growing ? 1 : 0);

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {growing && (
        <Grove
          plants={others}
          growing={growing}
          label={`Your grove: ${plantCount(total)}`}
          className="w-full max-w-2xl h-[280px]"
          fallback={null}
        />
      )}
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5 text-center">
        <p className="text-lg font-semibold text-slate-900 dark:text-white" role="status">
          {message}
        </p>

        {canBreak && breakEnd !== null && (
          <div className="space-y-2">
            {breakRunning ? (
              <p className="text-sm text-slate-600 dark:text-zinc-400 tabular-nums" aria-live="off">
                Break: {formatClock(breakEnd - now)}
              </p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                Break&apos;s over whenever you&apos;re ready.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setBreakEnd(null);
                setBreakUsed(true);
              }}
              className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors ${focusRing}`}
            >
              {breakRunning ? "Skip" : "Done"}
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {canBreak && breakEnd === null && !breakUsed && (
            <button
              type="button"
              onClick={() => {
                const t = Date.now();
                setNow(t);
                setBreakEnd(t + BREAK_MS);
              }}
              className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors ${focusRing}`}
            >
              Take a 5-minute break
            </button>
          )}
          <button
            type="button"
            onClick={onNew}
            className={`min-h-[44px] px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors ${focusRing}`}
          >
            New session
          </button>
        </div>
      </div>
    </div>
  );
}
