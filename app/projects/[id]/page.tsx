"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMinutes, SPRINT_LABELS, formatRelativeDate } from "@/lib/utils";
import {
  Plus, Trash2, CheckCircle2, Circle, Pencil, Check, X,
  Moon, CalendarClock, Wand2, ChevronLeft,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  leadDays: number;
}

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  templateKey: string | null;
  notes: string;
  tasks: Task[];
}

interface Preset {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState("");

  const [notes, setNotes] = useState("");
  const [notesStatus, setNotesStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSprint, setEditSprint] = useState("4");
  const [editDeadline, setEditDeadline] = useState("");
  const [editScheduled, setEditScheduled] = useState("");
  const [editEst, setEditEst] = useState("30");
  const [editCategory, setEditCategory] = useState("STANDARD");
  const [editLeadDays, setEditLeadDays] = useState("0");

  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskSprint, setNewTaskSprint] = useState("4");
  const [newTaskEst, setNewTaskEst] = useState("30");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("STANDARD");
  const [newTaskLeadDays, setNewTaskLeadDays] = useState("0");

  const load = useCallback(async () => {
    const [projRes, presetsRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch("/api/presets"),
    ]);
    if (projRes.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const proj: Project = await projRes.json();
    setProject(proj);
    setNameValue(proj.name);
    setDeadlineValue(proj.deadline ? proj.deadline.slice(0, 10) : "");
    setNotes(proj.notes ?? "");
    setPresets(await presetsRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
  }, []);

  const reloadTasks = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) return;
    const proj: Project = await res.json();
    setProject(proj);
  }, [id]);

  async function saveName() {
    if (!project) return;
    setEditingName(false);
    if (nameValue === project.name) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue }),
    });
    if (res.ok) {
      setProject((p) => p ? { ...p, name: nameValue } : p);
    } else {
      setNameValue(project.name);
    }
  }

  async function saveDeadline() {
    if (!project) return;
    setEditingDeadline(false);
    const newDeadline = deadlineValue || null;
    const current = project.deadline ? project.deadline.slice(0, 10) : null;
    if (newDeadline === current) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline: newDeadline }),
    });
    if (res.ok) {
      setProject((p) => p ? { ...p, deadline: newDeadline } : p);
    } else {
      setDeadlineValue(project.deadline ? project.deadline.slice(0, 10) : "");
    }
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    setNotesStatus("saving");
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        setNotesStatus("saved");
      } catch {
        setNotesStatus("error");
      }
    }, 1000);
  }

  async function deleteProject() {
    if (!confirm("Delete this project and all its tasks?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/projects");
  }

  async function toggleTask(taskId: string, done: boolean) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    reloadTasks();
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditName(task.name);
    setEditSprint(String(task.sprint));
    setEditDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setEditScheduled(task.scheduledDate ? task.scheduledDate.slice(0, 10) : "");
    setEditEst(String(task.estMinutes));
    setEditCategory(task.workCategory);
    setEditLeadDays(String(task.leadDays));
  }

  async function saveEditTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        sprint: parseInt(editSprint),
        deadline: editDeadline || null,
        scheduledDate: editScheduled || null,
        estMinutes: parseInt(editEst),
        workCategory: editCategory,
        leadDays: parseInt(editLeadDays),
      }),
    });
    setEditingTaskId(null);
    reloadTasks();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    reloadTasks();
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setNewTaskName(preset.name);
    setNewTaskSprint(String(preset.sprint));
    setNewTaskEst(String(preset.estMinutes));
    setNewTaskCategory(preset.workCategory);
  }

  async function addTask() {
    if (!newTaskName.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        name: newTaskName,
        sprint: parseInt(newTaskSprint),
        estMinutes: parseInt(newTaskEst),
        deadline: newTaskDeadline || null,
        workCategory: newTaskCategory,
        leadDays: parseInt(newTaskLeadDays),
      }),
    });
    setNewTaskName(""); setNewTaskDeadline(""); setNewTaskLeadDays("0");
    setAddingTask(false);
    reloadTasks();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400 text-sm">
        Loading…
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="space-y-4">
        <Link
          href="/projects"
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Projects
        </Link>
        <p className="text-zinc-400 text-sm">Project not found.</p>
      </div>
    );
  }

  const sortedTasks = [...project.tasks].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
  });

  const donePct = project.tasks.length > 0
    ? Math.round((project.tasks.filter((t) => t.done).length / project.tasks.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors w-fit"
      >
        <ChevronLeft className="h-4 w-4" /> Projects
      </Link>

      {/* Header card */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 space-y-3">
        {editingName ? (
          <Input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") { setEditingName(false); setNameValue(project.name); }
            }}
            autoFocus
            className="text-xl font-bold h-auto py-1"
          />
        ) : (
          <h1
            className="text-xl font-bold text-slate-900 dark:text-white cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setEditingName(true)}
            title="Click to edit"
          >
            {project.name}
          </h1>
        )}

        <div className="flex items-center gap-3">
          {editingDeadline ? (
            <Input
              type="date"
              value={deadlineValue}
              onChange={(e) => setDeadlineValue(e.target.value)}
              onBlur={saveDeadline}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDeadline();
                if (e.key === "Escape") {
                  setEditingDeadline(false);
                  setDeadlineValue(project.deadline ? project.deadline.slice(0, 10) : "");
                }
              }}
              autoFocus
              className="h-8 text-xs w-40"
            />
          ) : (
            <span
              className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              onClick={() => setEditingDeadline(true)}
              title="Click to edit deadline"
            >
              {project.deadline
                ? `Due ${format(new Date(project.deadline), "d MMM yyyy")}`
                : "No deadline — click to add"}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={deleteProject}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
            title="Delete project"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-full bg-green-500 rounded transition-all"
              style={{ width: `${donePct}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400 tabular-nums">
            {project.tasks.filter((t) => t.done).length}/{project.tasks.length}
          </span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

        {/* Tasks — 3/5 width */}
        <div className="md:col-span-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="font-medium text-sm">Tasks</h2>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sortedTasks.length === 0 && !addingTask && (
              <p className="px-4 py-3 text-sm text-zinc-400">No tasks yet.</p>
            )}

            {sortedTasks.map((task) =>
              editingTaskId === task.id ? (
                <div key={task.id} className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditTask(task.id);
                      if (e.key === "Escape") setEditingTaskId(null);
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
                      <label className="text-xs text-slate-500 dark:text-zinc-400">Lead days</label>
                      <Input type="number" min="0" value={editLeadDays} onChange={(e) => setEditLeadDays(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="space-y-1 w-28">
                      <label className="text-xs text-slate-500 dark:text-zinc-400">Est. mins</label>
                      <Input type="number" min="5" step="5" value={editEst} onChange={(e) => setEditEst(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="flex gap-2 justify-end flex-1 items-end pb-0.5">
                      <Button variant="ghost" size="sm" onClick={() => setEditingTaskId(null)}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveEditTask(task.id)}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-2.5 group ${task.done ? "opacity-50" : ""}`}
                >
                  <button onClick={() => toggleTask(task.id, !task.done)}>
                    {task.done
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <Circle className="h-4 w-4 text-zinc-300 hover:text-green-500 transition-colors" />}
                  </button>
                  <span className={`flex-1 text-sm ${task.done ? "line-through" : ""}`}>{task.name}</span>
                  {task.workCategory === "GRADING" && <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                  {task.scheduledDate && (
                    <span className="text-xs text-zinc-400 shrink-0 flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {formatRelativeDate(task.scheduledDate)}
                    </span>
                  )}
                  {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-zinc-400 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                  <button
                    onClick={() => startEditTask(task)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            )}

            {/* Add task */}
            {addingTask ? (
              <div className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-500">New task</span>
                  {presets.length > 0 && (
                    <Select onValueChange={applyPreset}>
                      <SelectTrigger className="h-7 text-xs w-44 gap-1">
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
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTask();
                    if (e.key === "Escape") setAddingTask(false);
                  }}
                  autoFocus
                  className="text-sm"
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
                    <Select value={newTaskSprint} onValueChange={setNewTaskSprint}>
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
                    <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD" className="text-xs">📅 Prep period</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">🌙 Work night</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Deadline</label>
                    <Input type="date" value={newTaskDeadline} onChange={(e) => setNewTaskDeadline(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 dark:text-zinc-400">Est. mins</label>
                    <Input type="number" min="5" step="5" value={newTaskEst} onChange={(e) => setNewTaskEst(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setAddingTask(false)}>Cancel</Button>
                  <Button size="sm" onClick={addTask} disabled={!newTaskName.trim()}>Add task</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddingTask(true);
                  setNewTaskName(""); setNewTaskSprint("4"); setNewTaskEst("30");
                  setNewTaskDeadline(""); setNewTaskCategory("STANDARD"); setNewTaskLeadDays("0");
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            )}
          </div>
        </div>

        {/* Notes — 2/5 width */}
        <div className="md:col-span-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="font-medium text-sm">Notes</h2>
          </div>
          <div className="flex flex-col flex-1 p-4 gap-2">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Project notes, reminders, context…"
              className="flex-1 min-h-[200px] w-full resize-none rounded border border-zinc-200 dark:border-zinc-700 bg-transparent p-3 text-sm text-slate-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
            <p className="text-xs text-zinc-400">
              {notesStatus === "saving" && "Saving…"}
              {notesStatus === "saved" && "Saved"}
              {notesStatus === "error" && "Save failed"}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
