"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useModeContext, type Mode } from "@/components/ModeProvider";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { ArrowRight, ChevronDown, GripVertical, Search } from "lucide-react";
import { SprintBadge } from "@/components/SprintBadge";
import { formatMinutes } from "@/lib/utils";
import { SessionSetup } from "@/components/focus/SessionSetup";
import { SessionView, growingFor, type PileTask } from "@/components/focus/SessionView";
import { SessionEnd } from "@/components/focus/SessionEnd";
import { useFocusWindow } from "@/components/focus/FocusSessionProvider";
import type { FocusSessionApi } from "@/lib/focus/useFocusSession";
import { emptyDraft, readDraft, writeDraft, type SetupDraft } from "@/lib/focus/setupDraft";
import { useTaskCompletions } from "@/lib/focus/useTaskCompletions";
import { useGrove } from "@/lib/grove/useGrove";
import { hasLanded, withPendingPlant, type PendingPlant } from "@/lib/grove/pending";
import { Grove } from "@/components/grove/Grove";
import { plantCount, seedCount } from "@/components/focus/groveText";

type Task = {
  id: string;
  name: string;
  context: Mode;
  sprint: number;
  estMinutes: number;
  done: boolean;
  url?: string | null;
};

function LoadingTasks() {
  return <p role="status" className="py-16 text-center text-sm text-slate-600 dark:text-zinc-400">Loading your focus session…</p>;
}

export default function FocusPage() {
  const windowState = useFocusWindow();
  const controller = windowState?.controller;
  if (windowState?.takeControl) {
    return <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-sm">Focus is open in another Grove window.</p>
        <button type="button" onClick={windowState.takeControl} className="mt-3 min-h-11 rounded-lg bg-emerald-900 px-4 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-emerald-200 dark:text-emerald-950">Use Focus in this window</button>
      </div>;
  }
  if (!controller?.ready) return <LoadingTasks />;
  return <Suspense fallback={<LoadingTasks />}><FocusWorkspace focus={controller} /></Suspense>;
}

function useSetupDraft(owner: string, mode: Mode) {
  const key = `grove-focus-setup:${owner}:${mode}`;
  const [state, setState] = useState(() => ({ key, draft: readDraft(key) }));
  if (key !== state.key) setState({ key, draft: readDraft(key) });
  useLayoutEffect(() => {
    if (state.key === key) writeDraft(key, state.draft);
  }, [key, state]);
  const update = useCallback((change: (prior: SetupDraft) => SetupDraft) => {
    setState(prior => prior.key === key ? { key, draft: change(prior.draft) } : prior);
  }, [key]);
  return [state.draft, update] as const;
}

function FocusWorkspace({ focus }: { focus: FocusSessionApi }) {
  const requestedTask = useSearchParams().get("task");
  const { mode } = useModeContext();
  // Tasks for the queue builder: this mode only.
  const [modeTasks, setModeTasks] = useState<Task[]>([]);
  // Names for a saved session: every mode, done or not, so ticked tasks keep their names.
  const [nameTasks, setNameTasks] = useState<Task[]>([]);
  const [names, setNames] = useState<"pending" | "loaded" | "failed">("pending");
  const [draft, updateDraft] = useSetupDraft(focus.owner, mode);
  const { taskIds: queue, choosing } = draft;
  const [taskStatus, setTaskStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const taskRequest = useRef(0);
  const loadedMode = useRef<typeof mode | null>(null);
  const handledLink = useRef<string | null>(null);
  const [linkNotice, setLinkNotice] = useState("");
  const [query, setQuery] = useState("");
  const verifiedTasks = names === "loaded" ? nameTasks : null;
  const verifiedModeTasks = taskStatus === "loaded" && loadedMode.current === mode ? modeTasks : null;
  const sessionTasks = verifiedTasks ?? verifiedModeTasks;
  const { unsavedTasks, completeTask, retry, dismiss } = useTaskCompletions(
    focus.owner, verifiedTasks, verifiedModeTasks,
    (id) => setModeTasks((previous) => previous.map((task) => task.id === id ? { ...task, done: true } : task)),
  );
  const lastPicker = useRef<HTMLInputElement | null>(null);
  const returnToPicker = useRef(false);
  const linkedPicker = useRef<string | null>(null);
  const grove = useGrove();
  const setupRef = useRef<HTMLDivElement>(null);
  // Plants of ended sessions that the grove may not have yet, shown until a refresh does.
  const [pendingPlants, setPendingPlants] = useState<PendingPlant[]>([]);
  const plants = useMemo(
    () => pendingPlants.reduce(withPendingPlant, grove.plants),
    [pendingPlants, grove.plants],
  );

  useEffect(() => {
    setPendingPlants((prev) => {
      const next = prev.filter((pp) => !hasLanded(grove.plants, pp));
      return next.length === prev.length ? prev : next;
    });
  }, [grove.plants]);

  // A plant the server turned down (its start reached the server only after
  // "New session") never lands: stop showing it.
  const { plantsDropped } = focus;
  useEffect(() => {
    if (plantsDropped.length === 0) return;
    setPendingPlants((prev) => {
      const next = prev.filter((pp) => !plantsDropped.includes(pp.startedAt));
      return next.length === prev.length ? prev : next;
    });
  }, [plantsDropped]);

  // An end reached the server (perhaps after "New session"): load the grove again.
  const { refresh: refreshGrove } = grove;
  useEffect(() => {
    if (focus.endsSynced > 0) refreshGrove();
  }, [focus.endsSynced, refreshGrove]);

  const fetchList = useCallback(async (url: string): Promise<Task[]> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("bad response");
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("not a list");
    return data as Task[];
  }, []);

  const loadTasks = useCallback(() => {
    const request = ++taskRequest.current;
    setTaskStatus("loading");
    return fetchList(`/api/tasks?context=${mode}`)
      .then((data) => {
        if (request !== taskRequest.current) return;
        loadedMode.current = mode;
        setModeTasks(data);
        const eligible = new Set(data.filter((task) => !task.done).map((task) => task.id));
        updateDraft(prior => {
          const taskIds = prior.taskIds.filter(id => eligible.has(id));
          return taskIds.length ? { ...prior, taskIds } : emptyDraft();
        });
        setTaskStatus("loaded");
      })
      .catch(() => {
        if (request === taskRequest.current) setTaskStatus("failed");
      });
  }, [mode, fetchList, updateDraft]);

  const loadNames = useCallback(() => {
    return fetchList("/api/tasks")
      .then((data) => {
        setNameTasks(data);
        setNames("loaded");
      })
      .catch(() => setNames((n) => (n === "loaded" ? n : "failed")));
  }, [fetchList]);

  useEffect(() => {
    setModeTasks([]);
    setQuery("");
    setLinkNotice("");
    void loadTasks();
    return () => { taskRequest.current++; };
  }, [loadTasks]);

  useEffect(() => {
    void loadNames();
  }, [loadNames]);

  const tasks = modeTasks.filter((t) => !t.done);

  const search = query.trim().toLocaleLowerCase();
  const visibleTasks = search ? tasks.filter((task) => task.name.toLocaleLowerCase().includes(search)) : tasks;

  // A Forage link prepares a session. It never starts a clock or replaces an active session.
  useEffect(() => {
    if (!requestedTask) {
      handledLink.current = null;
      return;
    }
    if (!focus.ready || handledLink.current === requestedTask) return;
    if (focus.session && (focus.session.ended || !focus.session.taskIds.includes(requestedTask))) return;
    if (!focus.session && (taskStatus !== "loaded" || loadedMode.current !== mode)) return;
    handledLink.current = requestedTask;
    if (!focus.session) {
      if (modeTasks.some((task) => task.id === requestedTask && !task.done)) {
        lastPicker.current = null;
        linkedPicker.current = requestedTask;
        updateDraft(prior => ({ ...prior, choosing: true, taskIds: [requestedTask, ...prior.taskIds.filter(id => id !== requestedTask)] }));
        setQuery("");
        setLinkNotice("");
      } else {
        setLinkNotice("That task is no longer open in this workspace. Choose another task below.");
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [requestedTask, focus.ready, focus.session, mode, modeTasks, taskStatus, updateDraft]);

  const changeTasks = useCallback(() => {
    returnToPicker.current = true;
    updateDraft(prior => ({ ...prior, choosing: false }));
  }, [updateDraft]);

  // Wait for the mobile task list to become visible before restoring keyboard focus.
  useEffect(() => {
    if (choosing || !returnToPicker.current) return;
    returnToPicker.current = false;
    const previous = lastPicker.current;
    const available = Array.from(document.querySelectorAll<HTMLInputElement>('#focus-builder input[type="checkbox"]'));
    const picker = previous?.isConnected ? previous : available.find((item) => item.value === linkedPicker.current) ?? available[0];
    picker?.focus();
  }, [choosing, queue.length]);

  // If the pile empties while choosing a session, go back to the builder.
  useEffect(() => {
    if (choosing && queue.length === 0) changeTasks();
  }, [choosing, queue.length, changeTasks]);

  // Choosing a session hides the grove at the top, so the page shifts up; keep the setup in view.
  useEffect(() => {
    if (!choosing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setupRef.current?.focus({ preventScroll: true });
    setupRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [choosing]);

  function toggle(id: string) {
    updateDraft(prior => {
      const taskIds = prior.taskIds.includes(id) ? prior.taskIds.filter(taskId => taskId !== id) : [...prior.taskIds, id];
      return taskIds.length ? { ...prior, taskIds } : emptyDraft();
    });
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    updateDraft(prior => {
      const next = [...prior.taskIds];
      const [moved] = next.splice(result.source.index, 1);
      next.splice(result.destination!.index, 0, moved);
      return { ...prior, taskIds: next };
    });
  }

  function handleTick(taskId: string) {
    if (focus.tick(taskId)) completeTask(taskId);
  }

  function handleNewSession() {
    // Carry over what was not ticked, in order, if it still exists and is not done.
    const prev = focus.session;
    const ticked = new Set(prev?.ticks.map((t) => t.taskId) ?? []);
    const leftover = (prev?.taskIds ?? []).filter(
      (id) => !ticked.has(id) && modeTasks.some((t) => t.id === id && !t.done),
    );
    if (prev?.ended && prev.plant) {
      const { plant, ended, startedAt } = prev;
      setPendingPlants((list) => [
        ...list.filter((pp) => pp.startedAt !== startedAt),
        {
          species: plant.species, x: plant.x, y: plant.y, outcome: ended.outcome, startedAt, endedAt: ended.at,
          // a tend: the stage fixed at start (growingFor fills an older save without one)
          ...(plant.tendId !== undefined
            ? { tendId: plant.tendId, stage: growingFor(plant, plants, 1, ended.outcome)?.stage }
            : {}),
        },
      ]);
    }
    focus.clear();
    updateDraft(() => ({ ...emptyDraft(), taskIds: leftover }));
    void loadTasks();
    void loadNames();
    grove.refresh();
  }

  if (!focus.ready || (taskStatus === "loading" && !focus.session)) {
    return <LoadingTasks />;
  }
  if (!focus.session && choosing && taskStatus === "failed") {
    return <div className="space-y-2 py-6">
      <p role="status">Your setup is saved. Grove couldn’t load the tasks.</p>
      <button type="button" onClick={loadTasks} className="min-h-11 font-semibold underline">Retry loading tasks</button>
    </div>;
  }

  const running = focus.session !== null && !focus.session.ended;
  const groveCount = plants.length;

  const queuedTasks = queue
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);
  const selectedMinutes = queuedTasks.reduce((total, task) => total + task.estMinutes, 0);

  const pileRows = (
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
                      aria-label={`Reorder ${task.name}`}
                      className="inline-flex min-h-[36px] min-w-[28px] items-center justify-center text-slate-500 dark:text-zinc-400 cursor-grab"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 w-4 shrink-0">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-slate-800 dark:text-zinc-200">
                      {task.name}
                    </span>
                    <SprintBadge sprint={task.sprint} size="sm" />
                    <span className="text-xs text-slate-600 dark:text-zinc-400 shrink-0">
                      {task.estMinutes}m
                    </span>
                    <button
                      onClick={() => {
                        toggle(task.id);
                        if (queue.length === 1 && !choosing) changeTasks();
                      }}
                      aria-label={`Remove ${task.name} from pile`}
                      className="h-11 w-8 text-xl text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0 leading-none"
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
  );

  return (
    <div className={running ? "space-y-3" : "space-y-6"}>
      <header className={`flex items-center justify-between gap-4 ${!focus.session && !choosing ? "border-b border-slate-300/70 pb-2 dark:border-slate-700" : ""}`}>
        <div className="min-w-0">
          <h1 className={running ? "text-base font-semibold text-slate-700 dark:text-zinc-300" : "text-3xl font-semibold tracking-tight sm:text-4xl"}>
            {focus.session ? "Focus" : choosing ? "Set up your session" : "Focus"}
          </h1>
          {!focus.session && !choosing && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {grove.status === "failed" ? "Your grove couldn’t load. You can still use the timer." :
                grove.status === "loaded" ? `${plantCount(groveCount)} in your grove${grove.seeds === null ? "" : ` · ${seedCount(grove.seeds)}`}` : "Loading your grove…"}
            </p>
          )}
        </div>
        {!focus.session && !choosing && grove.status !== "failed" && (
          <Grove plants={plants} label={`Your grove: ${plantCount(groveCount)}`}
            className="h-[104px] w-[42%] max-w-[300px] sm:h-[145px]" fallback={null} />
        )}
      </header>
      {linkNotice && !focus.session && <p role="status" className="text-sm">{linkNotice}</p>}
      {requestedTask && focus.session && (focus.session.ended || !focus.session.taskIds.includes(requestedTask)) && (
        <p role="status" className="text-sm text-slate-600 dark:text-zinc-300">
          {focus.session.ended ? "Choose New session to focus on the task you opened." : "Your session is still running. The task you opened can be next."}
        </p>
      )}
      {names === "failed" && (
        <div className="flex flex-wrap items-center gap-x-4 text-sm text-slate-700 dark:text-zinc-300">
          <p>Task details couldn’t load.</p>
          <button type="button" onClick={loadNames} className="min-h-11 font-semibold underline">Reload task details</button>
        </div>
      )}
      {unsavedTasks.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <p role="status">{unsavedTasks.length === 1 ? "One completion hasn’t reached your task list." : `${unsavedTasks.length} completions haven’t reached your task list.`}</p>
          {unsavedTasks.map((task) => (
            <div role="group" aria-label={task.name} key={task.id} className="flex flex-wrap items-center gap-x-4">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{task.name}</span>
              <button type="button" onClick={() => void retry(task.id)} className="min-h-11 font-semibold underline">Retry saving</button>
              <button type="button" onClick={() => dismiss(task.id)} className="min-h-11 underline">Keep open</button>
            </div>
          ))}
        </div>
      )}

      {focus.session && !focus.session.ended ? (
        <SessionView
          session={focus.session}
          now={focus.now}
          wakeLockOk={focus.wakeLockOk}
          tasks={focus.session.taskIds.map(
            (id): PileTask =>
              sessionTasks?.find((t) => t.id === id) ?? {
                id,
                name: names === "loaded" ? "A task that's no longer on your list" : "Task",
                completionState: names === "loaded" ? "removed" : names === "pending" ? "checking" : "unavailable",
              },
          )}
          plants={plants}
          groveStatus={grove.status}
          onComplete={handleTick}
          onGiveUp={focus.giveUp}
        />
      ) : focus.session?.ended ? (
        <SessionEnd now={focus.now} session={focus.session} tasks={sessionTasks ?? []} plants={plants} onNew={handleNewSession} onStartBreak={focus.startBreak} />
      ) : (
        <div className={`space-y-6 ${queue.length > 0 && !choosing ? "pb-24 lg:pb-0" : ""}`}>
        <div id="focus-builder" className={choosing ? "mx-auto max-w-2xl" : "grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"}>
          {/* Task list */}
          <div className={`min-w-0 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 ${choosing ? "hidden" : ""}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100 mb-3">Choose tasks</h2>

            {(tasks.length > 6 || query) && taskStatus === "loaded" && (
              <div className="mb-3 flex min-h-[44px] items-center gap-2 rounded-md border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-emerald-600 dark:border-zinc-700">
                <Search size={16} aria-hidden="true" className="shrink-0 text-slate-500" />
                <input type="search" aria-label="Find a task" placeholder="Find a task" value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none sm:text-sm" />
              </div>
            )}
            {taskStatus === "failed" ? (
              <div className="text-sm text-slate-600 dark:text-zinc-300">
                <p>Your tasks couldn’t load.</p>
                <button type="button" onClick={loadTasks} className="min-h-[44px] font-semibold underline underline-offset-4">Try again</button>
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-sm text-slate-600 dark:text-zinc-300">
                <p>No unfinished tasks in your {mode === "PERSONAL" ? "Home" : "Work"} workspace.</p>
                <Link href="/tasks" className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4">Go to Tasks</Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {visibleTasks.length === 0 && (
                  <p className="py-2 text-sm">No tasks match your search. <button type="button" onClick={() => setQuery("")} className="min-h-[44px] font-medium underline">Clear search</button></p>
                )}
                {visibleTasks.map((task) => (
                  <label
                    key={task.id}
                    className={`flex min-h-[48px] scroll-mb-24 items-center gap-2 rounded-md px-2 py-2 cursor-pointer focus-within:ring-2 focus-within:ring-inset focus-within:ring-emerald-600 sm:gap-3 ${queue.includes(task.id) ? "bg-emerald-50 dark:bg-emerald-950" : "hover:bg-slate-50 dark:hover:bg-zinc-800"}`}
                  >
                    <input
                      type="checkbox" value={task.id}
                      checked={queue.includes(task.id)}
                      onChange={(event) => { lastPicker.current = event.currentTarget; toggle(task.id); }}
                      className="w-4 h-4 shrink-0 accent-emerald-700 dark:accent-emerald-400"
                    />
                    <span className="min-w-0 flex-1 break-words text-sm text-slate-800 dark:text-zinc-200">
                      {task.name}
                    </span>
                    <SprintBadge sprint={task.sprint} size="sm" />
                    <span className="text-xs text-slate-600 dark:text-zinc-400 w-10 text-right">
                      {task.estMinutes}m
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Queue panel */}
          <div className={`min-w-0 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 ${queue.length === 0 ? "hidden lg:block" : ""}`}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Your pile</h2>
              {queue.length > 0 && <span className="text-xs tabular-nums text-slate-600 dark:text-zinc-400">{formatMinutes(selectedMinutes)} estimated</span>}
            </div>

            {queue.length === 0 ? (
              <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                Your first pick goes to the top. You can reorder the pile before starting.
              </p>
            ) : choosing ? (
                <details className="group/pile mb-4">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0"><span className="block text-xs text-slate-600 dark:text-zinc-400">First task</span>
                      <strong className="break-words font-medium">{queuedTasks[0]?.name}</strong>
                      {queue.length > 1 && <span className="ml-2 text-xs text-slate-600 dark:text-zinc-400">+{queue.length - 1} more</span>}
                    </span>
                    <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open/pile:rotate-180" />
                  </summary>
                  {pileRows}
                </details>
            ) : pileRows}

            {choosing && queue.length > 0 ? (
              <div ref={setupRef} tabIndex={-1} role="region" aria-label="Session setup" className="space-y-4 scroll-mt-4">
                <SessionSetup
                  taskIds={queue}
                  options={draft.options}
                  onOptionsChange={options => updateDraft(prior => ({ ...prior, options: { ...prior.options, ...options } }))}
                  plants={plants}
                  seeds={grove.seeds}
                  groveStatus={grove.status}
                  onStart={input => { focus.start(input); updateDraft(emptyDraft); }}
                />
                <button
                  type="button"
                  onClick={changeTasks}
                  className="w-full min-h-[44px] text-sm font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
                >
                  ← Change tasks
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => updateDraft(prior => ({ ...prior, choosing: true }))}
                disabled={queue.length === 0}
                className="hidden lg:block w-full min-h-[44px] py-2.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
              >
                Choose session →
              </button>
            )}
          </div>
        </div>
        {queue.length > 0 && !choosing && (
          <div className="fixed inset-x-0 bottom-0 z-30 !mt-0 border-t border-emerald-200 bg-white px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] dark:border-emerald-900 dark:bg-zinc-900 lg:hidden">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <div className="min-w-0" role="status" aria-atomic="true">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{queue.length} {queue.length === 1 ? "task" : "tasks"} in your pile</p>
                <p className="text-xs text-slate-600 dark:text-zinc-400">{formatMinutes(selectedMinutes)} estimated</p>
              </div>
              <button type="button" onClick={() => updateDraft(prior => ({ ...prior, choosing: true }))} className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-200 dark:text-emerald-950">
                Choose session <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
