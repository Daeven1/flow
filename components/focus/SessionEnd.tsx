"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Coffee } from "lucide-react";
import { formatClock, progress, segments, type SavedSession, type Segment } from "@/lib/focus/session";
import { useModeContext, type Mode } from "@/components/ModeProvider";
import { useFocusTitle } from "@/lib/focus/useFocusTitle";
import { Grove } from "@/components/grove/Grove";
import type { GrovePlant } from "@/lib/grove/layout";
import { DROPPED_LINE, plantCount, speciesName } from "@/components/focus/groveText";
import { growingFor } from "@/components/focus/SessionView";

type Props = {
  now: number;
  session: SavedSession;
  plants: GrovePlant[];
  tasks: { id: string; name: string; context: Mode }[];
  onStartBreak: () => void;
  onNew: () => void;
};

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:focus-visible:outline-emerald-300";
const primary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-200 dark:text-emerald-950 dark:hover:bg-emerald-100 ${focusRing}`;
const secondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-900/25 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-900/5 dark:border-emerald-100/30 dark:text-emerald-100 dark:hover:bg-white/5 ${focusRing}`;

export function SessionEnd({ now, session, plants, tasks, onStartBreak, onNew }: Props) {
  const { mode } = useModeContext();
  const ended = session.ended;
  const breakEnd = session.breakEndsAt;
  const heading = useRef<HTMLHeadingElement>(null);

  const breakRunning = breakEnd !== undefined && now < breakEnd;
  const breakClock = breakEnd === undefined ? "" : formatClock(breakEnd - now);
  useEffect(() => { heading.current?.focus(); }, [session.startedAt, breakEnd]);

  const title = breakEnd !== undefined
    ? breakRunning ? "On a break" : "Break complete"
    : ended?.outcome === "CLEARED" ? "List cleared"
    : ended?.outcome === "COMPLETED" ? "Session complete"
    : "Session ended early";
  useFocusTitle(breakRunning ? `${breakClock} · Break · Grove` : `${title} · Grove`);

  if (!ended) return null;

  const minutes = Math.min(session.plannedMinutes, Math.max(0, Math.round((ended.at - session.startedAt) / 60_000)));
  const focusTime = minutes === 0 ? "Under a minute of focus" : `${minutes} ${minutes === 1 ? "minute" : "minutes"} of focus`;
  const success = ended.outcome === "COMPLETED" || ended.outcome === "CLEARED";
  const plant = session.plant?.species === "CHICORY" && session.id === null ? null : session.plant;
  const tend = plant?.tendId !== undefined;
  // Use the stage saved at the start even if the server already refreshed the tree.
  const growing = growingFor(plant, plants, progress(session, ended.at), ended.outcome);
  // A server refresh may have added our new plant, even on a different spot.
  const others = growing
    ? plants.filter((p) =>
        tend
          ? p.id !== growing.tendId
          : !(p.x === growing.spot.x && p.y === growing.spot.y) &&
            !(p.species === growing.species && Date.parse(p.plantedAt) >= session.startedAt),
      )
    : plants;
  const total = others.length + (growing ? 1 : 0);
  const plantMessage = plant && (
    tend
      ? success ? "Your tree grew a stage." : "Your tree stayed at its current stage."
      : `Your ${speciesName(plant.species, true)} ${success ? "took root" : "withered"}.`
  );
  const completed = new Set(session.ticks.map((tick) => tick.taskId)).size;
  const allocation = success ? segments(session, ended.at) : [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const workspaces = new Set<Mode>();
  for (const { taskId } of allocation) {
    const context = taskById.get(taskId)?.context;
    if (context === "PROFESSIONAL" || context === "PERSONAL") workspaces.add(context);
  }
  function renderMinutes(rows: Segment[], offset = 0) {
    return (
      <ol className="divide-y divide-emerald-900/10 dark:divide-emerald-100/15">
        {rows.map(({ taskId, minutes }, index) => (
          <li key={taskId} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">{taskById.get(taskId)?.name ?? `Task ${offset + index + 1}`}</span>
            <span className="shrink-0 font-medium tabular-nums">{minutes} min</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <section aria-labelledby="focus-result-heading" className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-emerald-900/15 bg-[#f5f8ed] text-emerald-950 dark:border-emerald-200/15 dark:bg-[#1a322c] dark:text-emerald-50">
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <h2 ref={heading} tabIndex={-1} id="focus-result-heading" aria-live="polite" aria-atomic="true" className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl">
          {title}
        </h2>
        {breakEnd !== undefined ? (
          breakRunning ? (
            <div className="mt-4">
              <p role="timer" aria-label="Break time remaining" aria-live="off" className="text-6xl font-semibold leading-none tracking-[-0.055em] tabular-nums sm:text-7xl">{breakClock}</p>
              <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">left in your 5-minute break</p>
            </div>
          ) : <p className="mt-2 text-sm">Start your next session whenever you’re ready.</p>
        ) : (
          <>
            <p className="mt-2 text-base leading-relaxed">
              {success ? focusTime : ended.outcome === "LEFT" ? "Strict focus ended after more than 10 seconds away. No time was logged." : "No time was logged for this session."}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">
              {completed} of {session.taskIds.length} {session.taskIds.length === 1 ? "task" : "tasks"} checked off.{plantMessage && ` ${plantMessage}`}
            </p>
            {session.plantDropped && <p className="mt-2 text-sm">{DROPPED_LINE[session.plantDropped]}</p>}
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {success && breakEnd === undefined && (
            <button type="button" onClick={onStartBreak} className={primary}>
              <Coffee size={16} aria-hidden="true" /> Take a 5-minute break
            </button>
          )}
          <button type="button" onClick={onNew} className={success && breakEnd === undefined ? secondary : primary}>
            {breakRunning ? "End break and plan next session" : "New session"} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {allocation.length > 0 && (
          <section aria-label="Time by task" className="mt-6 border-t border-emerald-900/20 pt-3 dark:border-emerald-100/20">
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <h3 className="text-sm font-semibold">Time by task</h3>
              <div className="flex flex-wrap gap-x-3">
                {Array.from(workspaces.size ? workspaces : [mode], (workspace) => (
                  <Link key={workspace} href={`/time?workspace=${workspace}`} className={`inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium underline underline-offset-4 ${focusRing}`}>
                    {workspace === "PERSONAL" ? "Home" : "Work"} time history <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
            {renderMinutes(allocation.slice(0, 3))}
            {allocation.length > 3 && (
              <details className="text-sm">
                <summary className={`min-h-11 cursor-pointer content-center rounded-md font-medium ${focusRing}`}>Remaining tasks ({allocation.length - 3})</summary>
                {renderMinutes(allocation.slice(3), 3)}
              </details>
            )}
          </section>
        )}
      </div>
      {growing && (
        <Grove
          plants={others}
          growing={growing}
          label={`Your grove: ${plantCount(total)}`}
          className="focus-garden-overview w-full bg-gradient-to-b from-transparent to-emerald-900/10 dark:to-emerald-100/5"
          fallback={null}
        />
      )}
    </section>
  );
}
