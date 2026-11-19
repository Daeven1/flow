"use client";

import { useEffect, useState } from "react";
import { formatClock, type SavedSession } from "@/lib/focus/session";

type Props = {
  session: SavedSession; // an ended session
  onNew: () => void;
};

const BREAK_MS = 5 * 60_000;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

export function SessionEnd({ session, onNew }: Props) {
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

  const minutes = Math.max(1, Math.round((ended.at - session.startedAt) / 60_000));
  const minutesText = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const canBreak = ended.outcome === "COMPLETED" || ended.outcome === "CLEARED";

  let message: string;
  switch (ended.outcome) {
    case "COMPLETED":
      message = `Session complete. ${minutesText} of focus.`;
      break;
    case "CLEARED":
      message = `List cleared in ${minutesText}. Nicely done.`;
      break;
    case "LEFT":
      message =
        "You stepped away from Grove, so this session didn't count. Everything else is just as you left it.";
      break;
    default:
      message = "Session ended early. Nothing else has changed.";
  }

  return (
    <div className="flex justify-center py-8">
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
