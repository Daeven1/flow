"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SPRINT_LABELS, formatMinutes } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Pencil, Check, X, GripVertical,
} from "lucide-react";

interface TemplateTask {
  id?: string;
  name: string;
  leadDays: number;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  sortOrder: number;
  isNew?: boolean;
}

interface Template {
  id: string;
  key: string;
  label: string;
  description: string;
  isCustom: boolean;
  tasks: TemplateTask[];
}

export function TemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [editLabel, setEditLabel] = useState<Record<string, string>>({});
  const [editDesc, setEditDesc] = useState<Record<string, string>>({});
  const [editTasks, setEditTasks] = useState<Record<string, TemplateTask[]>>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    setTemplates(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function startEdit(template: Template) {
    setEditing((prev) => { const next = new Set(prev); next.add(template.id); return next; });
    setExpanded((prev) => { const next = new Set(prev); next.add(template.id); return next; });
    setEditLabel((prev) => ({ ...prev, [template.id]: template.label }));
    setEditDesc((prev) => ({ ...prev, [template.id]: template.description }));
    setEditTasks((prev) => ({
      ...prev,
      [template.id]: template.tasks.map((t, i) => ({ ...t, sortOrder: i })),
    }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function saveEdit(id: string) {
    await fetch(`/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editLabel[id],
        description: editDesc[id],
        tasks: editTasks[id].map((t, i) => ({ ...t, sortOrder: i })),
      }),
    });
    cancelEdit(id);
    load();
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? Projects already created from it won't be affected.")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    load();
  }

  async function createTemplate() {
    if (!newLabel.trim()) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, description: newDesc, tasks: [] }),
    });
    setNewLabel(""); setNewDesc(""); setShowNewForm(false);
    load();
  }

  async function resetToDefaults() {
    await fetch("/api/templates", { method: "DELETE" });
    setResetConfirm(false);
    setExpanded(new Set());
    setEditing(new Set());
    setEditTasks({});
    load();
  }

  function updateTask(templateId: string, index: number, field: keyof TemplateTask, value: string | number) {
    setEditTasks((prev) => {
      const tasks = [...(prev[templateId] ?? [])];
      tasks[index] = { ...tasks[index], [field]: value };
      return { ...prev, [templateId]: tasks };
    });
  }

  function addTask(templateId: string) {
    setEditTasks((prev) => {
      const tasks = [...(prev[templateId] ?? [])];
      tasks.push({ name: "", leadDays: 0, sprint: 4, estMinutes: 30, workCategory: "STANDARD", sortOrder: tasks.length, isNew: true });
      return { ...prev, [templateId]: tasks };
    });
  }

  function removeTask(templateId: string, index: number) {
    setEditTasks((prev) => {
      const tasks = [...(prev[templateId] ?? [])];
      tasks.splice(index, 1);
      return { ...prev, [templateId]: tasks };
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {resetConfirm ? (
            <>
              <span className="text-xs text-zinc-500">Reset all templates to defaults?</span>
              <button onClick={() => setResetConfirm(false)} className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={resetToDefaults} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors">Yes, reset</button>
            </>
          ) : (
            <button onClick={() => setResetConfirm(true)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              Reset to defaults
            </button>
          )}
        </div>
        <Button size="sm" onClick={() => setShowNewForm(!showNewForm)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />New template
        </Button>
      </div>

      {/* New template form */}
      {showNewForm && (
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
          <h3 className="font-medium text-sm">New Template</h3>
          <Input
            placeholder="Template name (e.g. Exhibition Prep)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTemplate()}
            autoFocus
          />
          <Input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <p className="text-xs text-zinc-400">You can add tasks after creating the template.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowNewForm(false)}>Cancel</Button>
            <Button size="sm" onClick={createTemplate} disabled={!newLabel.trim()}>Create</Button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.map((template) => {
          const isExpanded = expanded.has(template.id);
          const isEditing = editing.has(template.id);
          const tasks = isEditing ? (editTasks[template.id] ?? []) : template.tasks;

          return (
            <div key={template.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
              {/* Template header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => toggleExpand(template.id)} className="text-zinc-400">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Input
                        value={editLabel[template.id] ?? template.label}
                        onChange={(e) => setEditLabel((p) => ({ ...p, [template.id]: e.target.value }))}
                        className="h-8 text-sm font-medium"
                      />
                      <Input
                        value={editDesc[template.id] ?? template.description}
                        onChange={(e) => setEditDesc((p) => ({ ...p, [template.id]: e.target.value }))}
                        placeholder="Description"
                        className="h-8 text-xs"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {template.label}
                        {template.isCustom && (
                          <span className="text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">custom</span>
                        )}
                      </div>
                      {template.description && (
                        <div className="text-xs text-zinc-400 mt-0.5">{template.description}</div>
                      )}
                      <div className="text-xs text-zinc-400 mt-0.5">{template.tasks.length} tasks</div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => cancelEdit(template.id)}>
                        <X className="h-3.5 w-3.5 mr-1" />Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(template.id)}>
                        <Check className="h-3.5 w-3.5 mr-1" />Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(template)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 transition-colors"
                        title="Edit template"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                        title="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Tasks */}
              {isExpanded && (
                <div className="border-t border-zinc-100 dark:border-zinc-800">
                  {tasks.length === 0 && !isEditing && (
                    <p className="px-4 py-3 text-sm text-zinc-400">No tasks yet. Click edit to add some.</p>
                  )}

                  {isEditing ? (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-zinc-400 bg-slate-50 dark:bg-zinc-800">
                        <div className="col-span-1"></div>
                        <div className="col-span-4">Task name</div>
                        <div className="col-span-2">Sprint</div>
                        <div className="col-span-1">Lead days</div>
                        <div className="col-span-1">Mins</div>
                        <div className="col-span-2">Category</div>
                        <div className="col-span-1"></div>
                      </div>
                      {tasks.map((task, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2 items-center">
                          <div className="col-span-1 flex justify-center text-zinc-300">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <div className="col-span-4">
                            <Input
                              value={task.name}
                              onChange={(e) => updateTask(template.id, i, "name", e.target.value)}
                              placeholder="Task name"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <Select value={String(task.sprint)} onValueChange={(v) => updateTask(template.id, i, "sprint", parseInt(v))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[1,2,3,4].map((s) => (
                                  <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1">
                            <Input
                              type="number"
                              min="0"
                              value={task.leadDays}
                              onChange={(e) => updateTask(template.id, i, "leadDays", parseInt(e.target.value) || 0)}
                              className="h-7 text-xs"
                              title="Days before project deadline to schedule this task"
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              type="number"
                              min="5"
                              step="5"
                              value={task.estMinutes}
                              onChange={(e) => updateTask(template.id, i, "estMinutes", parseInt(e.target.value) || 30)}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <Select value={task.workCategory} onValueChange={(v) => updateTask(template.id, i, "workCategory", v)}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="STANDARD" className="text-xs">📅 Prep</SelectItem>
                                <SelectItem value="GRADING" className="text-xs">🌙 Night</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <button
                              onClick={() => removeTask(template.id, i)}
                              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="px-4 py-2">
                        <button
                          onClick={() => addTask(template.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add task
                        </button>
                      </div>
                      <div className="px-4 py-2 text-xs text-zinc-400 bg-slate-50 dark:bg-zinc-800">
                        <strong>Lead days</strong>: how many days before the project deadline this task should be due. 0 = on the deadline, 3 = 3 days before, etc.
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {tasks.map((task, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2">
                          <span className="text-xs text-zinc-400 w-5 text-right shrink-0">{i + 1}</span>
                          <span className="flex-1 text-sm">{task.name}</span>
                          <span className="text-xs text-zinc-400 shrink-0">
                            {task.leadDays > 0 ? `${task.leadDays}d before` : "on deadline"}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                            task.workCategory === "GRADING"
                              ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          }`}>
                            {task.workCategory === "GRADING" ? "🌙" : "📅"}
                          </span>
                          <span className="text-xs font-medium shrink-0" style={{
                            color: task.sprint === 1 ? "#E24B4A" : task.sprint === 2 ? "#BA7517" :
                                   task.sprint === 3 ? "#378ADD" : "#7F77DD"
                          }}>
                            S{task.sprint}
                          </span>
                          <span className="text-xs text-zinc-400 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
