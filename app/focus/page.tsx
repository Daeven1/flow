"use client";

import { useCallback, useEffect, useState } from "react";
import { useModeContext } from "@/components/ModeProvider";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import { StickyPile } from "@/components/StickyPile";
import { SprintBadge } from "@/components/SprintBadge";
import { SPRINT_COLORS } from "@/lib/utils";
import { SessionSetup } from "@/components/focus/SessionSetup";
import { SessionView, type PileTask } from "@/components/focus/SessionView";
import { SessionEnd } from "@/components/focus/SessionEnd";
import { useFocusSession } from "@/lib/focus/useFocusSession";

type Task = {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
};

export default function FocusPage() {
  const { mode } = useModeContext();
  // Tasks for the queue builder: this mode only.
  const [modeTasks, setModeTasks] = useState<Task[]>([]);
  // Names for a saved session: every mode, done or not, so ticked tasks keep their names.
  const [nameTasks, setNameTasks] = useState<Task[]>([]);
  const [names, setNames] = useState<"pending" | "loaded" | "failed">("pending");
  const [queue, setQueue] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const focus = useFocusSession();

  const fetchList = useCallback(async (url: string): Promise<Task[]> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("bad response");
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("not a list");
    return data as Task[];
  }, []);

  const loadTasks = useCallback(() => {
    return fetchList(`/api/tasks?context=${mode}`)
      .then((data) => setModeTasks(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mode, fetchList]);

  const loadNames = useCallback(() => {
    return fetchList("/api/tasks")
      .then((data) => {
        setNameTasks(data);
        setNames("loaded");
      })
      .catch(() => setNames((n) => (n === "loaded" ? n : "failed")));
  }, [fetchList]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadNames();
  }, [loadNames]);

  const tasks = modeTasks.filter((t) => !t.done);

  // If the pile empties while choosing a session, go back to the builder.
  useEffect(() => {
    if (choosing && queue.length === 0) setChoosing(false);
  }, [choosing, queue.length]);

  function toggle(id: string) {
    setQueue((prev) =>
      prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]
    );
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    setQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(result.source.index, 1);
      next.splice(result.destination!.index, 0, moved);
      return next;
    });
  }

  // Never awaited by the pile: if the save fails the pile still moves on.
  async function completeTask(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    if (res.ok) {
      setModeTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: true } : t)));
    }
  }

  function handleTick(taskId: string) {
    completeTask(taskId).catch(() => {});
    focus.tick(taskId);
  }

  function handleNewSession() {
    // Carry over what was not ticked, in order, if it still exists and is not done.
    const prev = focus.session;
    const ticked = new Set(prev?.ticks.map((t) => t.taskId) ?? []);
    const leftover = (prev?.taskIds ?? []).filter(
      (id) => !ticked.has(id) && modeTasks.some((t) => t.id === id && !t.done),
    );
    focus.clear();
    setQueue(leftover);
    setChoosing(false);
    void loadTasks();
    void loadNames();
  }

  if (!focus.ready || (loading && !focus.session)) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400 dark:text-zinc-500">
        Loading tasks…
      </div>
    );
  }

  const queuedTasks = queue
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Focus Mode
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Pick your tasks, choose a session, and stay with it
          </p>
        </div>
      </div>

      {focus.session && !focus.session.ended ? (
        <SessionView
          session={focus.session}
          now={focus.now}
          wakeLockOk={focus.wakeLockOk}
          tasks={focus.session.taskIds.map(
            (id): PileTask =>
              nameTasks.find((t) => t.id === id) ?? {
                id,
                name: names === "loaded" ? "A task that's no longer on your list" : "Task",
              },
          )}
          onComplete={handleTick}
          onGiveUp={focus.giveUp}
        />
      ) : focus.session?.ended ? (
        <SessionEnd session={focus.session} onNew={handleNewSession} />
      ) : (
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
                      checked={queue.includes(task.id)}
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
          </div>

          {/* Queue panel */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4">
              Your pile ({queue.length} task{queue.length === 1 ? "" : "s"})
            </div>

            {queue.length === 0 ? (
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
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="focus-queue">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-1 mb-4"
                    >
                      {queuedTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-2 px-2 py-2 rounded-lg border text-sm ${
                                snapshot.isDragging
                                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 shadow-md"
                                  : "bg-slate-50 dark:bg-zinc-800 border-slate-100 dark:border-zinc-700"
                              }`}
                            >
                              <span
                                {...provided.dragHandleProps}
                                aria-label="Drag to reorder"
                                className="text-slate-300 dark:text-zinc-600 hover:text-slate-500 dark:hover:text-zinc-400 cursor-grab"
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 w-4 shrink-0">
                                {index + 1}
                              </span>
                              <span className="flex-1 text-slate-800 dark:text-zinc-200 truncate">
                                {task.name}
                              </span>
                              <SprintBadge sprint={task.sprint} size="sm" />
                              <span className="text-xs text-slate-400 dark:text-zinc-500 shrink-0">
                                {task.estMinutes}m
                              </span>
                              <button
                                onClick={() => toggle(task.id)}
                                aria-label="Remove from pile"
                                className="text-slate-300 dark:text-zinc-600 hover:text-rose-400 dark:hover:text-rose-400 shrink-0 ml-1 leading-none"
                                title="Remove from pile"
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}

            {choosing && queue.length > 0 ? (
              <div className="space-y-4">
                <SessionSetup taskIds={queue} onStart={focus.start} />
                <button
                  type="button"
                  onClick={() => setChoosing(false)}
                  className="w-full min-h-[44px] text-sm font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
                >
                  ← Change tasks
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setChoosing(true)}
                disabled={queue.length === 0}
                className="w-full min-h-[44px] py-2.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
              >
                Choose session →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
