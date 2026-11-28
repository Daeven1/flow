"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, Clock3, ExternalLink } from "lucide-react";
import { useFocusTitle } from "@/lib/focus/useFocusTitle";
import { Grove, type Growing } from "@/components/grove/Grove";
import { GROWTH_STEPS, growthFrame } from "@/lib/grove/growth";
import { SPECIES_INFO } from "@/lib/grove/species";
import { MAX_STAGE, type GrovePlant } from "@/lib/grove/layout";
import type { GroveStatus } from "@/lib/grove/useGrove";
import { DROPPED_LINE, NO_WEBGL_LINE, growingLine, plantCount } from "@/components/focus/groveText";
import {
  endsAt,
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
  url?: string | null;
  completionState?: "checking" | "unavailable" | "removed";
};

/**
 * What the canvas grows for a session's plant. A tend grows the stage saved at
 * start; an older save without one grows its tree one stage from the list.
 */
export function growingFor(
  plant: SavedSession["plant"],
  plants: GrovePlant[],
  p: number,
  outcome: Outcome | null,
): Growing | null {
  if (!plant) return null;
  const spot = { x: plant.x, y: plant.y };
  if (plant.tendId === undefined) return { species: plant.species, spot, stage: 1, progress: p, outcome };
  const tree = plants.find((t) => t.id === plant.tendId);
  const stage = plant.stage ?? Math.min(MAX_STAGE, (tree?.stage ?? 1) + 1);
  return { species: plant.species, spot, stage, progress: p, outcome, tendId: plant.tendId };
}

export function FocusVisual({ progress, outcome }: { progress: number; outcome: Outcome | null }) {
  const pct = Math.round(progress * 100);
  return (
    <div
      role="progressbar"
      aria-label="Session progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-950/15 dark:bg-white/15"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${outcome === "LEFT" || outcome === "GAVE_UP" ? "bg-slate-500" : "bg-emerald-700 dark:bg-emerald-300"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type Props = {
  session: SavedSession;
  now: number;
  wakeLockOk: boolean | null;
  tasks: PileTask[];
  plants: GrovePlant[];
  groveStatus: GroveStatus;
  onComplete: (taskId: string) => void;
  onGiveUp: () => void;
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:focus-visible:outline-emerald-300";
const primary =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-200 dark:text-emerald-950 dark:hover:bg-emerald-100 ${focusRing}`;

function ignoreHeldKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
}

export function SessionView({ session, now, wakeLockOk, tasks, plants, groveStatus, onComplete, onGiveUp }: Props) {
  const [confirming, setConfirming] = useState(false);
  const endButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const returnToEnd = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const left = remainingMs(session, now);
  const clock = formatClock(left);
  const minutesLeft = Math.ceil(left / 60_000);
  const p = progress(session, now);
  const growing = growingFor(session.plant, plants, p, null);
  const milestone = growing && (SPECIES_INFO[growing.species].botany
    ? `Growth ${growthFrame(p) + 1} of ${GROWTH_STEPS + 1}`
    : `${Math.floor(p * 100)}% grown`);
  const strict = session.rule === "STRICT";
  const finish = new Date(endsAt(session)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const ticked = new Set(session.ticks.map((tick) => tick.taskId));
  const [current, next] = tasks.filter((task) => !ticked.has(task.id));
  let reference: URL | null = null;
  if (current?.url) {
    try {
      const parsed = new URL(current.url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") reference = parsed;
    } catch { /* A task with an incomplete link can still be completed. */ }
  }
  useFocusTitle(`${clock} · Focus · Grove`);

  useEffect(() => { heading.current?.focus(); }, [session.startedAt]);

  useEffect(() => {
    if (confirming) {
      keepButton.current?.focus();
      returnToEnd.current = true;
    } else if (returnToEnd.current) {
      endButton.current?.focus();
      returnToEnd.current = false;
    }
  }, [confirming]);

  return (
    <div className={growing ? "focus-garden-session" : "mx-auto grid max-w-4xl items-start gap-4 lg:grid-cols-2"} onKeyDownCapture={ignoreHeldKey}>
      <section aria-labelledby="focus-clock-heading" className="focus-garden-field">
        <div className="focus-garden-readout">
          <div>
            <h2 ref={heading} tabIndex={-1} id="focus-clock-heading" className="text-sm font-semibold outline-none">Time remaining</h2>
            <p role="timer" aria-label="Focus time remaining" aria-live="off" className="focus-garden-clock mt-1 font-semibold leading-none tracking-[-0.055em] tabular-nums">{clock}</p>
          </div>
          <p className="mt-1 text-right text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">
            <span className="block font-semibold">{strict ? "Strict" : "Gentle"} focus</span>
            <span>{session.plannedMinutes} minutes</span>
          </p>
        </div>
        {growing && (
          <Grove
            plants={plants}
            growing={growing}
            label={`${growingLine(growing.species)} ${milestone}.${groveStatus === "loaded" ? ` ${plantCount(plants.length)} in your grove` : ""}`}
            className={`focus-garden-canvas w-full${strict && wakeLockOk === false ? " focus-garden-warning" : ""}`}
            fallback={<p className="mx-4 my-4 text-sm">{NO_WEBGL_LINE}</p>}
          />
        )}
        <div className="focus-garden-caption">
          <FocusVisual progress={p} outcome={null} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">
            <span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" /> Ends at {finish}</span>
            {growing && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-amber-600 dark:border-amber-300" />{SPECIES_INFO[growing.species].name} · {milestone}</span>}
          </div>
          {session.plantDropped && <p className="mt-3 text-sm">{DROPPED_LINE[session.plantDropped]}</p>}
          {growing && groveStatus === "failed" && <p className="mt-3 text-sm">Your grove couldn’t load. Your plants are safe.</p>}
          {strict && <p className="mt-3 border-t border-emerald-900/15 pt-3 text-xs leading-relaxed dark:border-emerald-200/20">Keep Grove visible. More than 10 seconds away ends this session.{wakeLockOk === false && " This device can’t keep the screen awake, so keep it unlocked."}</p>}
        </div>
        <div className="sr-only" role="status" aria-atomic="true">{minutesLeft} {minutesLeft === 1 ? "minute" : "minutes"} left</div>
      </section>

      <section aria-label="Session tasks" className="focus-garden-tools min-w-0 space-y-3">
        {current && (
          <div className="rounded-xl border border-amber-900/20 bg-[#fff7d9] p-4 text-[#352f1f] shadow-sm sm:p-5 dark:border-amber-300/20 dark:bg-[#3a3527] dark:text-amber-50">
            <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-[#655330] dark:text-[#e4cd99]">
              <span className="font-semibold">Current task</span>
              <span className="tabular-nums">{ticked.size + 1} of {tasks.length}</span>
            </div>
            <h3 aria-live="polite" aria-atomic="true" className="text-xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{current.name}</h3>
            {current.estMinutes !== undefined && <p className="mt-2 text-xs text-[#655330] dark:text-[#e4cd99]">{current.estMinutes} min estimated{current.sprint !== undefined ? ` · Sprint ${current.sprint}` : ""}</p>}
            {reference && (
              <div className="mt-2">
                <a href={reference.href} target="_blank" rel="noopener noreferrer"
                  aria-describedby={strict ? "focus-reference-rule" : undefined}
                  className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-md text-sm font-medium text-emerald-900 underline decoration-emerald-800/40 underline-offset-4 hover:decoration-current dark:text-emerald-200 ${focusRing}`}>
                  <ExternalLink size={15} aria-hidden="true" className="shrink-0" />
                  <span className="shrink-0">Open task link</span>
                  <span aria-hidden="true" className="truncate text-xs font-normal text-[#655330] dark:text-[#e4cd99]">{reference.hostname}</span>
                  <span className="sr-only"> on {reference.hostname} in a new tab</span>
                </a>
                {strict && <p id="focus-reference-rule" className="text-xs leading-relaxed text-[#655330] dark:text-[#e4cd99]">Return to Grove within 10 seconds to keep Strict focus running.</p>}
              </div>
            )}
            <div className="focus-garden-task-action mt-4">
              <span aria-hidden="true" className="focus-garden-action-task">{current.name}</span>
              <button
                type="button"
                disabled={confirming || current.completionState === "checking" || current.completionState === "unavailable"}
                onClick={(event) => { if (event.detail <= 1) onComplete(current.id); }}
                className={`w-full disabled:opacity-50 ${primary}`}
              >
                {current.completionState ? {
                  checking: "Checking task…",
                  unavailable: "Task unavailable",
                  removed: "Continue past removed task",
                }[current.completionState] : <><Check size={17} aria-hidden="true" /> Complete task</>}
              </button>
            </div>
            {next && <p className="mt-3 border-t border-amber-900/15 pt-3 text-sm leading-snug text-[#655330] [overflow-wrap:anywhere] dark:border-amber-100/15 dark:text-[#e4cd99]"><span className="font-semibold">Up next</span> · {next.name}</p>}
          </div>
        )}
        {confirming ? (
          <div
            role="group" aria-labelledby="focus-end-heading" aria-describedby="focus-end-effect"
            onKeyDown={(event) => {
              if (event.key === "Escape") { event.preventDefault(); setConfirming(false); }
            }}
            className="focus-garden-confirm rounded-xl border border-slate-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h3 id="focus-end-heading" className="text-base font-semibold">End this session early?</h3>
            <p id="focus-end-effect" className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
              This session’s time won’t be logged.{session.plant && (session.plant.tendId ? " Your tree will stay at its current stage." : " This plant will wither.")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button ref={keepButton} type="button" onClick={() => setConfirming(false)} className={primary}>Keep focusing</button>
              <button type="button" onClick={onGiveUp} className={`min-h-11 rounded-lg px-4 text-sm font-semibold text-rose-800 hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950 ${focusRing}`}>End early</button>
            </div>
          </div>
        ) : (
          <button ref={endButton} type="button" onClick={() => setConfirming(true)} className={`focus-garden-exit min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 underline-offset-4 hover:underline dark:text-zinc-300 ${focusRing}`}>End session</button>
        )}
      </section>
    </div>
  );
}
