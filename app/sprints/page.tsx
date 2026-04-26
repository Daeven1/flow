"use client";

import { useState, useEffect, useCallback } from "react";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { CapacityBar } from "@/components/CapacityBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SPRINT_LABELS,
  SPRINT_COLORS,
  formatMinutes,
  formatRelativeDate,
  urgencySort,
} from "@/lib/utils";
import { CheckCircle2, Circle, Pencil, Check, X, Moon, CalendarClock, Zap, Star } from "lucide-react";
import { parseISO, compareAsc, startOfDay, addDays, differenceInCalendarDays } from "date-fns";

interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
  pinned: boolean;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  project: { id: string; name: string } | null;
}

type SortMode = "scheduled" | "deadline";

export default function SprintsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("scheduled");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSprint, setEditSprint] = useState("1");
  const [editDeadline, setEditDeadline] = useState("");
  const [editScheduled, setEditScheduled] = useState("");
  const [editEst, setEditEst] = useState("30");
  const [editCategory, setEditCategory] = useState("STANDARD");

  const load = useCallback(async () => {
    setTasks(await fetch("/api/tasks").then((r) => r.json()));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleTask(id: string, done: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  }

  async function togglePin(id: string, pinned: boolean) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, pinned } : t));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditName(task.name);
    setEditSprint(String(task.sprint));
    setEditDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setEditScheduled(task.scheduledDate ? task.scheduledDate.slice(0, 10) : "");
    setEditEst(String(task.estMinutes));
    setEditCategory(task.workCategory);
  }

  async function saveEdit(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        sprint: parseInt(editSprint),
        deadline: editDeadline || null,
        scheduledDate: editScheduled || null,
        estMinutes: parseInt(editEst),
        workCategory: editCategory,
      }),
    });
    setEditingId(null);
    load();
  }

  function sortTasks(taskList: Task[]) {
    const pinnedFirst = (a: Task, b: Task) => Number(b.pinned) - Number(a.pinned);
    if (sortMode === "deadline") {
      return [...taskList].sort((a, b) => {
        const pin = pinnedFirst(a, b);
        if (pin !== 0) return pin;
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return compareAsc(parseISO(a.deadline), parseISO(b.deadline));
      });
    }
    return [...taskList].sort((a, b) => {
      const pin = pinnedFirst(a, b);
      if (pin !== 0) return pin;
      return urgencySort(a, b);
    });
  }

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const openTasks = tasks.filter((t) => !t.done);

  // Auto-escalated: deadline <= tomorrow from ANY sprint
  const urgentNow = openTasks.filter((t) => {
    if (!t.deadline) return false;
    return startOfDay(parseISO(t.deadline)) <= tomorrow;
  });
  const urgentIds = new Set(urgentNow.map((t) => t.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sprints</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">All open tasks organised by sprint — manage workload and capacity across S1–S4.</p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-zinc-400 mr-1">Sort:</span>
          {(["scheduled", "deadline"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-2 py-1 rounded transition-colors ${
                sortMode === mode
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {mode === "scheduled" ? "Scheduled" : "Deadline"}
            </button>
          ))}
        </div>
      </div>

      {/* ⚡ Auto-escalated urgent tasks */}
      {urgentNow.length > 0 && (
        <div className="rounded border-2 border-red-300 dark:border-red-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800">
            <Zap className="h-4 w-4 text-red-500" />
            <span className="font-medium text-sm text-red-700 dark:text-red-400">Due Very Soon</span>
            <span className="text-xs text-red-400 ml-1">— surfaces here regardless of sprint</span>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900">
            {urgentNow.map((task) => {
              const dl = task.deadline ? startOfDay(parseISO(task.deadline)) : null;
              const daysLeft = dl ? differenceInCalendarDays(dl, today) : null;
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-900 group" style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}` }}>
                  <button onClick={() => toggleTask(task.id, true)}>
                    <Circle className="h-4 w-4 text-red-300 hover:text-green-500 transition-colors" />
                  </button>
                  <span className="flex-1 text-sm font-medium">{task.name}</span>
                  {task.workCategory === "GRADING" && <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                  {task.project && <span className="text-xs text-zinc-400 hidden sm:block shrink-0">{task.project.name}</span>}
                  <span className={`text-xs font-semibold shrink-0 ${
                    daysLeft !== null && daysLeft < 0 ? "text-red-600" :
                    daysLeft === 0 ? "text-red-600" : "text-amber-600"
                  }`}>
                    {daysLeft === null ? "" : daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "due today" : "due tomorrow"}
                  </span>
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-zinc-400 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                  <button
                    onClick={() => startEdit(task)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {[1, 2, 3, 4].map((sprint) => {
          const sprintTasks = openTasks.filter((t) => t.sprint === sprint && !urgentIds.has(t.id));
          const total = sprintTasks.reduce((s, t) => s + t.estMinutes, 0);
          const sorted = sortTasks(sprintTasks);
          const color = SPRINT_COLORS[sprint];

          return (
            <div key={sprint} className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
              {/* Sprint header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-medium text-sm">{SPRINT_LABELS[sprint]}</span>
                  <span className="text-xs text-zinc-400">
                    {sorted.length} task{sorted.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-zinc-400">{formatMinutes(total)}</span>
              </div>

              {/* Capacity bar */}
              <div className="px-4 pb-3">
                <CapacityBar sprint={sprint} totalMinutes={total} />
              </div>

              {/* Tasks */}
              {sorted.length === 0 ? (
                <div className="px-4 pb-4 text-sm text-zinc-400">No tasks in this sprint.</div>
              ) : (
                <div className="border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {sorted.map((task) =>
                    editingId === task.id ? (
                      /* ── Edit mode ── */
                      <div key={task.id} className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(task.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          className="text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
                            <Select value={editSprint} onValueChange={setEditSprint}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4].map((s) => (
                                  <SelectItem key={s} value={String(s)} className="text-xs">
                                    {SPRINT_LABELS[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-zinc-400">Category</label>
                            <Select value={editCategory} onValueChange={setEditCategory}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-zinc-400">Deadline</label>
                            <Input
                              type="date"
                              value={editDeadline}
                              onChange={(e) => setEditDeadline(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-zinc-400">Scheduled</label>
                            <Input
                              type="date"
                              value={editScheduled}
                              onChange={(e) => setEditScheduled(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="space-y-1 w-32">
                            <label className="text-xs text-slate-500 dark:text-zinc-400">Est. mins</label>
                            <Input
                              type="number"
                              min="5"
                              step="5"
                              value={editEst}
                              onChange={(e) => setEditEst(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex gap-2 justify-end flex-1 items-end pb-0.5">
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" onClick={() => saveEdit(task.id)}>
                              <Check className="h-3.5 w-3.5 mr-1" /> Save
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal view ── */
                      <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 group" style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}` }}>
                        <button onClick={() => toggleTask(task.id, true)}>
                          <Circle className="h-4 w-4 text-zinc-300 hover:text-green-500 transition-colors" />
                        </button>
                        <button
                          onClick={() => togglePin(task.id, !task.pinned)}
                          className="shrink-0"
                          title={task.pinned ? "Unpin task" : "Pin to top"}
                        >
                          <Star className={`h-3.5 w-3.5 transition-colors ${task.pinned ? "fill-amber-400 text-amber-400" : "text-zinc-200 dark:text-zinc-700 hover:text-amber-400"}`} />
                        </button>
                        <span className="flex-1 text-sm">{task.name}</span>

                        {/* Work night indicator */}
                        {task.workCategory === "GRADING" && (
                          <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        )}

                        {task.project && (
                          <span className="text-xs text-zinc-400 hidden md:block shrink-0">
                            {task.project.name}
                          </span>
                        )}

                        {/* Scheduled date */}
                        {task.scheduledDate && (
                          <span className={`flex items-center gap-1 text-xs shrink-0 ${
                            startOfDay(parseISO(task.scheduledDate)) <= today
                              ? "text-amber-600 dark:text-amber-400 font-medium"
                              : "text-zinc-400"
                          }`}>
                            <CalendarClock className="h-3 w-3" />
                            {formatRelativeDate(task.scheduledDate)}
                          </span>
                        )}

                        {/* Deadline urgency badge */}
                        {task.deadline && <UrgencyBadge dueDate={task.deadline} />}

                        <span className="text-xs text-zinc-400 tabular-nums shrink-0">
                          {formatMinutes(task.estMinutes)}
                        </span>
                        <button
                          onClick={() => startEdit(task)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors shrink-0"
                          title="Edit task"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recently done */}
      {tasks.filter((t) => t.done).length > 0 && (
        <div>
          <h2 className="font-medium text-sm mb-3 text-zinc-500">Completed</h2>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {tasks
              .filter((t) => t.done)
              .slice(0, 10)
              .map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-2.5 opacity-50">
                  <button onClick={() => toggleTask(task.id, false)}>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </button>
                  <span className="flex-1 text-sm line-through">{task.name}</span>
                  <SprintBadge sprint={task.sprint} size="sm" />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
