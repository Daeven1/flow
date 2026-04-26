"use client";

import { useEffect, useState } from "react";
import { StickyPile } from "@/components/StickyPile";
import { SprintBadge } from "@/components/SprintBadge";
import { SPRINT_COLORS } from "@/lib/utils";

type Task = {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
};

export default function FocusPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data: Task[]) => {
        setTasks(data.filter((t) => !t.done));
        setLoading(false);
      });
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startSession() {
    const pile = tasks.filter((t) => selected.has(t.id));
    setSession(pile);
  }

  async function completeTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function resetSession() {
    setSession(null);
    setSelected(new Set());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400 dark:text-zinc-500">
        Loading tasks…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Focus Mode
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Pick your tasks, then work through the pile one by one
          </p>
        </div>
        {session && (
          <button
            onClick={resetSession}
            className="px-3 py-1.5 border border-slate-200 dark:border-zinc-700 text-sm font-medium rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ← New pile
          </button>
        )}
      </div>

      {session ? (
        /* Active session: show the pile */
        <div className="flex justify-center py-8">
          <StickyPile
            tasks={session}
            onComplete={completeTask}
            onAllDone={resetSession}
          />
        </div>
      ) : (
        /* Task selection */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Task list */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4">
              Build your pile — select tasks
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-4">
                No incomplete tasks. Add some in the Tasks page first.
              </p>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-zinc-800">
                {tasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex items-center gap-3 py-2.5 pl-3 cursor-pointer group"
                    style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}` }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(task.id)}
                      onChange={() => toggle(task.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 text-blue-500 focus:ring-blue-500/20"
                    />
                    <span className="flex-1 text-sm text-slate-800 dark:text-zinc-200">
                      {task.name}
                    </span>
                    <SprintBadge sprint={task.sprint} size="sm" />
                    <span className="text-xs text-slate-400 dark:text-zinc-500 w-10 text-right">
                      {task.estMinutes}m
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={startSession}
              disabled={selected.size === 0}
              className="mt-4 w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Focus Session →
            </button>
          </div>

          {/* Pile preview */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4">
              Your pile ({selected.size} task{selected.size === 1 ? "" : "s"})
            </div>

            {selected.size === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div
                  className="w-48 h-48 bg-amber-50 dark:bg-amber-100 rounded-sm shadow-md flex items-center justify-center"
                  style={{ transform: "rotate(1deg)" }}
                >
                  <p className="text-xs text-amber-400 text-center px-4">
                    Check tasks to add them here
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="relative w-48 h-48">
                  {selected.size > 2 && (
                    <div
                      className="absolute inset-0 bg-amber-300 rounded-sm"
                      style={{ transform: "rotate(3deg) translate(5px, 7px)", opacity: 0.4 }}
                    />
                  )}
                  {selected.size > 1 && (
                    <div
                      className="absolute inset-0 bg-amber-200 rounded-sm"
                      style={{ transform: "rotate(-1.5deg) translate(3px, 4px)", opacity: 0.65 }}
                    />
                  )}
                  <div
                    className="absolute inset-0 bg-yellow-100 rounded-sm shadow-md flex flex-col p-5"
                  >
                    <div className="text-[10px] font-semibold text-amber-700 opacity-60 mb-2">
                      1 of {selected.size}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {tasks.find((t) => selected.has(t.id))?.name}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 dark:text-zinc-500">
                  {selected.size} task{selected.size === 1 ? "" : "s"} queued
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
