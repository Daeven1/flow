"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPRINT_LABELS, formatMinutes, formatRelativeDate, urgencySort } from "@/lib/utils";
import { Plus, CheckCircle2, Circle, X, Pencil, Check, Moon, CalendarClock, Wand2, FolderOpen } from "lucide-react";
import { ProjectRow } from "@/components/ProjectRow";
import { parseISO, startOfDay } from "date-fns";

type FilterMode = "all" | "1" | "2" | "3" | "4" | "done";

interface Preset {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
}

interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  project: { id: string; name: string } | null;
}

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  tasks: { done: boolean }[];
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [presets, setPresets] = useState<Preset[]>([]);

  // New task form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSprint, setNewSprint] = useState("4");
  const [newEst, setNewEst] = useState("30");
  const [newDeadline, setNewDeadline] = useState("");
  const [newCategory, setNewCategory] = useState("STANDARD");

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSprint, setEditSprint] = useState("1");
  const [editDeadline, setEditDeadline] = useState("");
  const [editScheduled, setEditScheduled] = useState("");
  const [editEst, setEditEst] = useState("30");
  const [editCategory, setEditCategory] = useState("STANDARD");

  const load = useCallback(async () => {
    const [tasksRes, presetsRes, projectsRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/presets"),
      fetch("/api/projects"),
    ]);
    setTasks(await tasksRes.json());
    setPresets(await presetsRes.json());
    setProjects(await projectsRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function applyPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setNewName(preset.name);
    setNewSprint(String(preset.sprint));
    setNewEst(String(preset.estMinutes));
    setNewCategory(preset.workCategory);
  }

  async function addTask() {
    if (!newName.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        sprint: newSprint,
        estMinutes: newEst,
        deadline: newDeadline || null,
        workCategory: newCategory,
      }),
    });
    setNewName("");
    setNewDeadline("");
    setShowForm(false);
    load();
  }

  async function toggleTask(id: string, done: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
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

  const filtered = tasks.filter((t) => {
    if (filter === "done") return t.done;
    if (filter === "all") return !t.done;
    return !t.done && t.sprint === parseInt(filter);
  });

  const sorted = [...filtered].sort(urgencySort);

  const today = startOfDay(new Date());

  const FILTERS: { value: FilterMode; label: string }[] = [
    { value: "all", label: "All open" },
    { value: "1", label: "S1 Urgent" },
    { value: "2", label: "S2 Deadlines" },
    { value: "3", label: "S3 Admin" },
    { value: "4", label: "S4 Deep Work" },
    { value: "done", label: "Done" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tasks</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add task
        </Button>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">New Task</h2>
            {presets.length > 0 && (
              <Select onValueChange={applyPreset}>
                <SelectTrigger className="h-7 text-xs w-48 gap-1">
                  <Wand2 className="h-3 w-3 text-zinc-400 shrink-0" />
                  <SelectValue placeholder="Use a preset…" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Input
            placeholder="Task name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
              <Select value={newSprint} onValueChange={setNewSprint}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((s) => (
                    <SelectItem key={s} value={String(s)}>{SPRINT_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-zinc-400">Category</label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">📅 Prep period</SelectItem>
                  <SelectItem value="GRADING">🌙 Work night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-zinc-400">Est. minutes</label>
              <Input type="number" min="5" step="5" value={newEst} onChange={(e) => setNewEst(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 dark:text-zinc-400">Deadline</label>
              <Input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={addTask} disabled={!newName.trim()}>Add task</Button>
          </div>
        </div>
      )}

      {/* ── Projects ── */}
      {projects.length > 0 && filter === "all" && (
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800">
            <FolderOpen className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Projects</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {projects.map((p) => <ProjectRow key={p.id} project={p} />)}
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(({ value, label }) => {
          const count =
            value === "done"
              ? tasks.filter((t) => t.done).length
              : value === "all"
              ? tasks.filter((t) => !t.done).length
              : tasks.filter((t) => !t.done && t.sprint === parseInt(value)).length;
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 ${filter === value ? "opacity-70" : "opacity-60"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">
          {filter === "done" ? "No completed tasks." : "No tasks. Add one above!"}
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sorted.map((task) =>
            editingId === task.id ? (
              /* ── Edit mode ── */
              <div key={task.id} className="py-3 space-y-2 bg-slate-50 dark:bg-zinc-800 px-1 rounded">
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
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((s) => (
                          <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Category</label>
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Deadline</label>
                    <Input type="date" value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Scheduled</label>
                    <Input type="date" value={editScheduled} onChange={(e) => setEditScheduled(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="space-y-1 w-32">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Est. mins</label>
                    <Input type="number" min="5" step="5" value={editEst} onChange={(e) => setEditEst(e.target.value)} className="h-8 text-xs" />
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
              <div key={task.id} className={`flex items-center gap-3 py-3 group ${task.done ? "opacity-50" : ""}`}>
                <button onClick={() => toggleTask(task.id, !task.done)}>
                  {task.done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-zinc-300 hover:text-green-500 transition-colors" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
                  {task.project && (
                    <span className="ml-2 text-xs text-zinc-400">{task.project.name}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {task.workCategory === "GRADING" && (
                    <Moon className="h-3.5 w-3.5 text-indigo-400" />
                  )}
                  {task.scheduledDate && (
                    <span className={`flex items-center gap-1 text-xs ${
                      startOfDay(parseISO(task.scheduledDate)) <= today
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : "text-zinc-400"
                    }`}>
                      <CalendarClock className="h-3 w-3" />
                      {formatRelativeDate(task.scheduledDate)}
                    </span>
                  )}
                  {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-zinc-400 tabular-nums">{formatMinutes(task.estMinutes)}</span>
                  <button
                    onClick={() => startEdit(task)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                    title="Edit task"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                    title="Delete task"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
