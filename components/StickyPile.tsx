"use client";

import { useState } from "react";

type Task = {
  id: string;
  name: string;
  sprint?: number; // left out for a task that is no longer on the list
  estMinutes?: number;
};

type Props = {
  tasks: Task[];
  onComplete: (taskId: string) => void;
  onAllDone?: () => void;
  initialIndex?: number; // where to start, for resuming a session
  onCleared?: () => void; // called once when the last note is ticked; replaces the "All done" screen
};

export function StickyPile({ tasks, onComplete, onAllDone, initialIndex = 0, onCleared }: Props) {
  const [current, setCurrent] = useState(initialIndex);
  const [peeling, setPeeling] = useState(false);

  if (tasks.length === 0 || current >= tasks.length) {
    if (onCleared) return null;
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">🎉</div>
        <div className="text-xl font-bold text-slate-900 dark:text-white">
          All done!
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          You cleared your pile.
        </p>
        <button
          onClick={onAllDone}
          className="mt-2 px-4 py-2 border border-slate-200 dark:border-zinc-700 text-sm font-medium rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Start a new pile
        </button>
      </div>
    );
  }

  const task = tasks[current];
  const remaining = tasks.length - current;

  function handleDone() {
    if (peeling) return;
    setPeeling(true);
    onComplete(task.id);
    const isLast = current + 1 >= tasks.length;
    setTimeout(() => {
      setCurrent((c) => c + 1);
      setPeeling(false);
      if (isLast) onCleared?.();
    }, 380);
  }

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Pile */}
      <div className="relative" style={{ width: "min(90vw, 480px)", height: "min(90vw, 480px)" }}>
        {/* Shadow notes underneath */}
        {remaining > 2 && (
          <div
            className="absolute inset-0 bg-amber-300 rounded-sm"
            style={{ transform: "rotate(3deg) translate(8px, 10px)", opacity: 0.4 }}
          />
        )}
        {remaining > 1 && (
          <div
            className="absolute inset-0 bg-amber-200 rounded-sm"
            style={{ transform: "rotate(-1.5deg) translate(4px, 6px)", opacity: 0.65 }}
          />
        )}

        {/* Top note */}
        <div
          className={`absolute inset-0 bg-yellow-100 dark:bg-yellow-200 rounded-sm shadow-xl flex flex-col p-10 ${
            peeling
              ? "transition-all duration-[350ms] ease-in -translate-y-[120%] -rotate-[4deg] opacity-0 motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:rotate-0"
              : ""
          }`}
        >
          <div className="text-sm font-semibold text-amber-700 opacity-60 mb-4">
            {current + 1} of {tasks.length}
          </div>
          <div className="text-2xl font-semibold text-slate-900 leading-snug flex-1">
            {task.name}
          </div>
          <div className="flex items-center gap-3 mt-6">
            {task.sprint !== undefined && (
              <span className="text-sm font-bold px-3 py-1 rounded bg-amber-200 text-amber-800">
                Sprint {task.sprint}
              </span>
            )}
            {task.estMinutes !== undefined && (
              <span className="text-sm text-amber-700 opacity-60">
                {task.estMinutes} min
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Done button */}
      <button
        onClick={handleDone}
        disabled={peeling}
        className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-xl shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ✓ Done — next task
      </button>

      <p className="text-xs text-slate-400 dark:text-zinc-500">
        {remaining - 1} task{remaining - 1 === 1 ? "" : "s"} remaining
      </p>
    </div>
  );
}
