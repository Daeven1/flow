"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatMinutes, SPRINT_LABELS, formatRelativeDate } from "@/lib/utils";
import {
  Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Pencil, Check, X, BookmarkPlus, Moon, CalendarClock, Wand2,
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
  tasks: Task[];
}

interface DBTemplate {
  id: string;
  key: string;
  label: string;
  description: string;
  tasks: { id: string; name: string; leadDays: number; sprint: number; estMinutes: number; workCategory: string }[];
}

interface Preset {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<DBTemplate[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [creating, setCreating] = useState(false);

  // Task inline editing
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSprint, setEditSprint] = useState("4");
  const [editDeadline, setEditDeadline] = useState("");
  const [editScheduled, setEditScheduled] = useState("");
  const [editEst, setEditEst] = useState("30");
  const [editCategory, setEditCategory] = useState("STANDARD");
  const [editLeadDays, setEditLeadDays] = useState("0");

  // Save as template
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");

  // Add task to project
  const [addingToProject, setAddingToProject] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskSprint, setNewTaskSprint] = useState("4");
  const [newTaskEst, setNewTaskEst] = useState("30");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("STANDARD");
  const [newTaskLeadDays, setNewTaskLeadDays] = useState("0");

  const load = useCallback(async () => {
    const [projRes, tmplRes, presetsRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/templates"),
      fetch("/api/presets"),
    ]);
    setProjects(await projRes.json());
    setTemplates(await tmplRes.json());
    setPresets(await presetsRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createProject() {
    if (!name.trim()) return;
    setCreating(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, deadline: deadline || null, templateKey: selectedTemplate || null }),
    });
    setName(""); setDeadline(""); setSelectedTemplate("");
    setShowForm(false); setCreating(false);
    load();
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project and all its tasks?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
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

  async function saveEditTask(id: string) {
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
        leadDays: parseInt(editLeadDays),
      }),
    });
    setEditingTaskId(null);
    load();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  function applyPresetToTask(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setNewTaskName(preset.name);
    setNewTaskSprint(String(preset.sprint));
    setNewTaskEst(String(preset.estMinutes));
    setNewTaskCategory(preset.workCategory);
  }

  async function addTaskToProject(projectId: string) {
    if (!newTaskName.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: newTaskName,
        sprint: newTaskSprint,
        estMinutes: newTaskEst,
        deadline: newTaskDeadline || null,
        workCategory: newTaskCategory,
        leadDays: parseInt(newTaskLeadDays),
      }),
    });
    setNewTaskName(""); setNewTaskDeadline(""); setNewTaskLeadDays("0");
    setAddingToProject(null);
    load();
  }

  async function saveAsTemplate(project: Project) {
    if (!templateName.trim()) return;
    const tasks = project.tasks.map((t, i) => ({
      name: t.name,
      leadDays: t.leadDays,
      sprint: t.sprint,
      estMinutes: t.estMinutes,
      workCategory: t.workCategory,
      sortOrder: i,
    }));
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: templateName, description: templateDesc, tasks }),
    });
    setSavingTemplate(null);
    setTemplateName(""); setTemplateDesc("");
    load();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Projects</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />New project
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 space-y-4">
          <h2 className="font-medium text-sm">New Project</h2>
          <div className="space-y-2">
            <label className="text-xs text-slate-500 dark:text-zinc-400">Project name</label>
            <Input
              placeholder="e.g. Year 10 Product Design Assessment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-500 dark:text-zinc-400">Final deadline (optional)</label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-500 dark:text-zinc-400">Template (optional)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedTemplate("")}
                className={`text-left rounded border p-3 text-sm transition-colors ${
                  selectedTemplate === ""
                    ? "border-zinc-900 dark:border-zinc-100"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                }`}
              >
                <div className="font-medium">No template</div>
                <div className="text-xs text-zinc-400 mt-0.5">Start blank</div>
              </button>
              {templates.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSelectedTemplate(t.key)}
                  className={`text-left rounded border p-3 text-sm transition-colors ${
                    selectedTemplate === t.key
                      ? "border-zinc-900 dark:border-zinc-100"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{t.tasks.length} tasks</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={createProject} disabled={creating || !name.trim()}>
              Create project
            </Button>
          </div>
        </div>
      )}

      {/* Projects list */}
      {projects.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">No projects yet. Create one above.</div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const donePct = project.tasks.length > 0
              ? Math.round((project.tasks.filter((t) => t.done).length / project.tasks.length) * 100)
              : 0;
            const isExpanded = expanded.has(project.id);
            const sortedTasks = [...project.tasks].sort((a, b) => {
              if (!a.deadline && !b.deadline) return 0;
              if (!a.deadline) return 1;
              if (!b.deadline) return -1;
              return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
            });

            return (
              <div key={project.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                {/* Project header */}
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => toggleExpand(project.id)} className="text-zinc-400">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{project.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {project.deadline && (
                        <span className="text-xs text-zinc-400">
                          Due {format(new Date(project.deadline), "d MMM yyyy")}
                        </span>
                      )}
                      {project.templateKey && (
                        <span className="text-xs text-zinc-400">
                          {templates.find((t) => t.key === project.templateKey)?.label ?? project.templateKey}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                        <div className="h-full bg-green-500 rounded transition-all" style={{ width: `${donePct}%` }} />
                      </div>
                      <span className="text-xs text-zinc-400 tabular-nums">
                        {project.tasks.filter((t) => t.done).length}/{project.tasks.length}
                      </span>
                    </div>
                  </div>
                  {/* Save as template */}
                  <button
                    onClick={() => { setSavingTemplate(project.id); setTemplateName(project.name); setTemplateDesc(""); }}
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-500 transition-colors"
                    title="Save as template"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Save as template form */}
                {savingTemplate === project.id && (
                  <div className="mx-4 mb-4 p-3 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 space-y-2">
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Save {project.tasks.length} tasks as a reusable template</p>
                    <Input
                      placeholder="Template name"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={templateDesc}
                      onChange={(e) => setTemplateDesc(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setSavingTemplate(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => saveAsTemplate(project)} disabled={!templateName.trim()}>
                        Save template
                      </Button>
                    </div>
                  </div>
                )}

                {/* Task list */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {sortedTasks.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-zinc-400">No tasks.</p>
                    ) : (
                      sortedTasks.map((task) =>
                        editingTaskId === task.id ? (
                          /* ── Edit mode ── */
                          <div key={task.id} className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEditTask(task.id);
                                if (e.key === "Escape") setEditingTaskId(null);
                              }}
                              autoFocus className="text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="space-y-1">
                                <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
                                <Select value={editSprint} onValueChange={setEditSprint}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {[1,2,3,4].map((s) => (
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
                          /* ── Normal view ── */
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
                      )
                    )}

                    {/* Add task row */}
                    {addingToProject === project.id ? (
                      <div className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-zinc-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-500">New task</span>
                          {presets.length > 0 && (
                            <Select onValueChange={applyPresetToTask}>
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
                            if (e.key === "Enter") addTaskToProject(project.id);
                            if (e.key === "Escape") setAddingToProject(null);
                          }}
                          autoFocus className="text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-zinc-400">Sprint</label>
                            <Select value={newTaskSprint} onValueChange={setNewTaskSprint}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[1,2,3,4].map((s) => (
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
                          <Button variant="ghost" size="sm" onClick={() => setAddingToProject(null)}>Cancel</Button>
                          <Button size="sm" onClick={() => addTaskToProject(project.id)} disabled={!newTaskName.trim()}>Add task</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingToProject(project.id); setNewTaskName(""); setNewTaskSprint("4"); setNewTaskEst("30"); setNewTaskDeadline(""); setNewTaskCategory("STANDARD"); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add task
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
