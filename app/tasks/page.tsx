"use client";

import { useState, useEffect, useCallback } from "react";
import { useModeContext, type Mode } from "@/components/ModeProvider";
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
import { SPRINT_LABELS, SPRINT_COLORS, formatMinutes, formatRelativeDate, urgencySort } from "@/lib/utils";
import { Plus, CheckCircle2, Circle, X, Pencil, Check, Moon, CalendarClock, Wand2, Star, RefreshCw, Trash2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
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
  pinned: boolean;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  context: string;
  url: string | null;
  project: { id: string; name: string } | null;
}

type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY";

interface RecurringTask {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  context: string;
  recurrenceType: RecurrenceType;
  recurrenceDays: string;
  recurrenceMonthDay: number | null;
  deadlineOffset: number;
  active: boolean;
}

export default function TasksPage() {
  const { mode } = useModeContext();
  const headingCls = mode === "PERSONAL" ? "text-lime-900" : "text-slate-900 dark:text-white";
  const mutedCls   = mode === "PERSONAL" ? "text-yellow-700" : "text-zinc-500 dark:text-zinc-400";
  const cardCls    = mode === "PERSONAL"
    ? "bg-white dark:bg-zinc-900 border-yellow-200 dark:border-yellow-900"
    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800";

  const [tasks, setTasks] = useState<Task[]>([]);
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
  const [editContext, setEditContext] = useState<Mode>("PROFESSIONAL");
  const [editUrl, setEditUrl] = useState("");

  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [showRecurringForm, setShowRecurringForm] = useState(false);

  // Recurring form state
  const [rName, setRName] = useState("");
  const [rType, setRType] = useState<RecurrenceType>("WEEKLY");
  const [rDays, setRDays] = useState<number[]>([1]);
  const [rMonthDay, setRMonthDay] = useState(1);
  const [rSprint, setRSprint] = useState("1");
  const [rEst, setREst] = useState("30");
  const [rCategory, setRCategory] = useState("STANDARD");
  const [rContext, setRContext] = useState<Mode>("PROFESSIONAL");
  const [rDeadlineOffset, setRDeadlineOffset] = useState(0);

  const load = useCallback(async () => {
    await fetch("/api/recurring/spawn", { method: "POST" });
    const [tasksRes, presetsRes, recurringRes] = await Promise.all([
      fetch(`/api/tasks?context=${mode}`),
      fetch("/api/presets"),
      fetch("/api/recurring"),
    ]);
    setTasks(await tasksRes.json());
    setPresets(await presetsRes.json());
    setRecurringTasks(await recurringRes.json());
  }, [mode]);

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
        context: mode,
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
    setEditContext((task.context as Mode) ?? "PROFESSIONAL");
    setEditUrl(task.url ?? "");
  }

  function formatPattern(rt: RecurringTask): string {
    if (rt.recurrenceType === "DAILY") return "Every day";
    if (rt.recurrenceType === "MONTHLY") {
      const n = rt.recurrenceMonthDay ?? 1;
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      const suffix = s[(v - 20) % 10] ?? s[v] ?? s[0];
      return `${n}${suffix} of month`;
    }
    const days: number[] = JSON.parse(rt.recurrenceDays || "[]");
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return "Every " + days.map((d) => names[d]).join(", ");
  }

  function resetRecurringForm() {
    setRName(""); setRType("WEEKLY"); setRDays([1]); setRMonthDay(1);
    setRSprint("1"); setREst("30"); setRCategory("STANDARD");
    setRContext("PROFESSIONAL"); setRDeadlineOffset(0);
  }

  function populateRecurringForm(rt: RecurringTask) {
    setRName(rt.name);
    setRType(rt.recurrenceType);
    setRDays(JSON.parse(rt.recurrenceDays || "[]"));
    setRMonthDay(rt.recurrenceMonthDay ?? 1);
    setRSprint(String(rt.sprint));
    setREst(String(rt.estMinutes));
    setRCategory(rt.workCategory);
    setRContext(rt.context as Mode);
    setRDeadlineOffset(rt.deadlineOffset);
  }

  async function saveRecurring() {
    const body = {
      name: rName,
      sprint: rSprint,
      estMinutes: rEst,
      workCategory: rCategory,
      context: rContext,
      recurrenceType: rType,
      recurrenceDays: JSON.stringify(rType === "WEEKLY" ? rDays : []),
      recurrenceMonthDay: rType === "MONTHLY" ? rMonthDay : null,
      deadlineOffset: rDeadlineOffset,
    };
    if (editingRecurringId) {
      await fetch(`/api/recurring/${editingRecurringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditingRecurringId(null);
    } else {
      await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowRecurringForm(false);
    }
    resetRecurringForm();
    load();
  }

  async function toggleRecurringActive(id: string, active: boolean) {
    await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setRecurringTasks((prev) => prev.map((r) => r.id === id ? { ...r, active } : r));
  }

  async function deleteRecurring(id: string) {
    await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    setRecurringTasks((prev) => prev.filter((r) => r.id !== id));
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
        context: editContext,
        url: editUrl.trim() || null,
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
        <div>
          <h1 className={`text-xl font-bold ${headingCls}`}>Tasks</h1>
          <p className={`text-xs ${mutedCls} mt-0.5`}>Your full task backlog — add, filter by sprint, and manage everything in one place.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add task
        </Button>
      </div>

      {/* Add task form */}
      {showForm && (
        <div className={`rounded-xl border ${cardCls} p-4 space-y-3`}>
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
                  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700 shrink-0 self-end mb-0.5">
                    <button
                      type="button"
                      onClick={() => setEditContext("PROFESSIONAL")}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editContext === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      💼 Pro
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditContext("PERSONAL")}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editContext === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      🌿 Home
                    </button>
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
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 dark:text-zinc-400">Link URL</label>
                  <Input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            ) : (
              /* ── Normal view ── */
              <div key={task.id} className={`flex items-center gap-3 py-3 pl-3 group ${task.done ? "opacity-50" : ""}`} style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}` }}>
                <button onClick={() => toggleTask(task.id, !task.done)}>
                  {task.done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-zinc-300 hover:text-green-500 transition-colors" />
                  )}
                </button>
                {!task.done && (
                  <button
                    onClick={() => togglePin(task.id, !task.pinned)}
                    className="shrink-0"
                    title={task.pinned ? "Unpin task" : "Pin to top"}
                  >
                    <Star className={`h-3.5 w-3.5 transition-colors ${task.pinned ? "fill-amber-400 text-amber-400" : "text-zinc-200 dark:text-zinc-700 hover:text-amber-400"}`} />
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
                  {task.url && (
                    <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors" title={task.url}>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
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
      {/* ── Recurring tasks ── */}
      <div className={`rounded-xl border ${cardCls} overflow-hidden`}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
          onClick={() => setShowRecurring((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
            <span className="font-medium text-sm">Recurring</span>
            {recurringTasks.length > 0 && (
              <span className="text-xs bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 px-2 py-0.5 rounded-full">
                {recurringTasks.filter((r) => r.active).length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetRecurringForm();
                setEditingRecurringId(null);
                setShowRecurring(true);
                setShowRecurringForm((v) => !v);
              }}
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
            {showRecurring
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </button>

        {showRecurring && (
          <div>
            {/* New / Edit form */}
            {(showRecurringForm || editingRecurringId) && (
              <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 space-y-3">
                <Input
                  placeholder="Task name"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
                {/* Recurrence type selector */}
                <div className="flex items-center gap-1 bg-slate-200 dark:bg-zinc-700 rounded-lg p-0.5 w-fit">
                  {(["DAILY", "WEEKLY", "MONTHLY"] as RecurrenceType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRType(t)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        rType === t
                          ? "bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 shadow-sm"
                          : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300"
                      }`}
                    >
                      {t === "DAILY" ? "Daily" : t === "WEEKLY" ? "Weekly" : "Monthly"}
                    </button>
                  ))}
                </div>
                {/* Weekly day picker */}
                {rType === "WEEKLY" && (
                  <div className="flex gap-1">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label, i) => (
                      <button
                        key={i}
                        onClick={() =>
                          setRDays((prev) =>
                            prev.includes(i)
                              ? prev.filter((d) => d !== i)
                              : [...prev, i].sort()
                          )
                        }
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          rDays.includes(i)
                            ? "bg-slate-700 dark:bg-zinc-200 text-white dark:text-zinc-900"
                            : "bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Monthly day picker */}
                {rType === "MONTHLY" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-zinc-400">Day of month:</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={rMonthDay}
                      onChange={(e) => setRMonthDay(Number(e.target.value))}
                      className="h-8 text-xs w-20"
                    />
                  </div>
                )}
                {/* Sprint, est, category, context */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={rSprint} onValueChange={setRSprint}>
                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((s) => (
                        <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={rEst}
                    onChange={(e) => setREst(e.target.value)}
                    className="h-8 text-xs w-24"
                    placeholder="Est. mins"
                  />
                  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700">
                    {(["STANDARD", "GRADING"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setRCategory(cat)}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                          rCategory === cat ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {cat === "STANDARD" ? "☀️ Day" : "🌙 Night"}
                      </button>
                    ))}
                  </div>
                  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700">
                    <button
                      onClick={() => setRContext("PROFESSIONAL")}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${rContext === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      💼 Pro
                    </button>
                    <button
                      onClick={() => setRContext("PERSONAL")}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${rContext === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      🌿 Home
                    </button>
                  </div>
                </div>
                {/* Deadline offset */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-zinc-400">Due:</span>
                  <button
                    onClick={() => setRDeadlineOffset(0)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      rDeadlineOffset === 0
                        ? "border-slate-400 bg-slate-100 dark:bg-zinc-700 dark:border-zinc-500 font-medium"
                        : "border-transparent text-slate-400 hover:border-slate-200"
                    }`}
                  >
                    Same day
                  </button>
                  <span className="text-xs text-slate-400">+</span>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={rDeadlineOffset > 0 ? rDeadlineOffset : ""}
                    onChange={(e) => setRDeadlineOffset(Number(e.target.value))}
                    placeholder="days"
                    className="h-8 text-xs w-20"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRecurringForm(false);
                      setEditingRecurringId(null);
                      resetRecurringForm();
                    }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveRecurring}
                    disabled={!rName.trim() || (rType === "WEEKLY" && rDays.length === 0)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> {editingRecurringId ? "Update" : "Add"}
                  </Button>
                </div>
              </div>
            )}

            {/* Template list */}
            {recurringTasks.length === 0 && !showRecurringForm ? (
              <p className="px-4 py-4 text-sm text-slate-400 dark:text-zinc-500 italic">
                No recurring tasks yet. Click + New to add one.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {recurringTasks.map((rt) => (
                  <div
                    key={rt.id}
                    className={`flex items-center gap-3 px-4 py-2.5 group ${!rt.active ? "opacity-50" : ""}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{rt.name}</span>
                      <span className="ml-2 text-xs text-slate-400 dark:text-zinc-500">
                        {formatPattern(rt)}
                      </span>
                    </div>
                    <SprintBadge sprint={rt.sprint} size="sm" />
                    <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">
                      {formatMinutes(rt.estMinutes)}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-zinc-500 shrink-0">
                      {rt.deadlineOffset === 0 ? "same day" : `+${rt.deadlineOffset}d`}
                    </span>
                    <button
                      onClick={() => toggleRecurringActive(rt.id, !rt.active)}
                      className="shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors border-slate-200 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500"
                      title={rt.active ? "Pause" : "Resume"}
                    >
                      {rt.active ? "active" : "paused"}
                    </button>
                    <button
                      onClick={() => {
                        populateRecurringForm(rt);
                        setEditingRecurringId(rt.id);
                        setShowRecurringForm(false);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteRecurring(rt.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
