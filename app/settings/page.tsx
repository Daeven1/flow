"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SPRINT_LABELS, formatMinutes } from "@/lib/utils";
import { Check, Plus, Pencil, X, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface Preset {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  notes: string;
}

interface TemplateTask {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  leadDays: number;
}

interface Template {
  id: string;
  label: string;
  tasks: TemplateTask[];
}

export default function SettingsPage() {
  const [workNightDays, setWorkNightDays] = useState<number[]>([1]);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [resetPresetsConfirm, setResetPresetsConfirm] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editPresetName, setEditPresetName] = useState("");
  const [editPresetSprint, setEditPresetSprint] = useState("4");
  const [editPresetMins, setEditPresetMins] = useState("30");
  const [editPresetCategory, setEditPresetCategory] = useState("STANDARD");
  const [editPresetNotes, setEditPresetNotes] = useState("");
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetSprint, setNewPresetSprint] = useState("4");
  const [newPresetMins, setNewPresetMins] = useState("30");
  const [newPresetCategory, setNewPresetCategory] = useState("STANDARD");
  const [newPresetNotes, setNewPresetNotes] = useState("");

  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deleteAllDone, setDeleteAllDone] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [templateSavedId, setTemplateSavedId] = useState<string | null>(null);
  // Track per-template edited tasks
  const [templateEdits, setTemplateEdits] = useState<Record<string, Record<string, { estMinutes: number; sprint: number; workCategory: string }>>>({});

  const loadAll = useCallback(async () => {
    const [settRes, presetRes, tmplRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/presets"),
      fetch("/api/templates"),
    ]);
    const settData = await settRes.json();
    const presetData = await presetRes.json();
    const tmplData = await tmplRes.json();
    setWorkNightDays(settData.workNightDays ?? [1]);
    setPresets(presetData);
    setTemplates(tmplData);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Work nights ──
  function toggleDay(day: number) {
    setWorkNightDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
    setSettingsSaved(false);
  }

  async function saveSettings() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workNightDays }),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  // ── Presets ──
  function startEditPreset(p: Preset) {
    setEditingPresetId(p.id);
    setEditPresetName(p.name);
    setEditPresetSprint(String(p.sprint));
    setEditPresetMins(String(p.estMinutes));
    setEditPresetCategory(p.workCategory);
    setEditPresetNotes(p.notes);
  }

  async function savePreset(id: string) {
    await fetch(`/api/presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editPresetName,
        sprint: parseInt(editPresetSprint),
        estMinutes: parseInt(editPresetMins),
        workCategory: editPresetCategory,
        notes: editPresetNotes,
      }),
    });
    setEditingPresetId(null);
    loadAll();
  }

  async function deletePreset(id: string) {
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function resetPresets() {
    await fetch("/api/presets", { method: "DELETE" });
    setResetPresetsConfirm(false);
    loadAll();
  }

  async function addPreset() {
    if (!newPresetName.trim()) return;
    await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPresetName,
        sprint: parseInt(newPresetSprint),
        estMinutes: parseInt(newPresetMins),
        workCategory: newPresetCategory,
        notes: newPresetNotes,
      }),
    });
    setNewPresetName(""); setNewPresetMins("30"); setNewPresetSprint("4");
    setNewPresetCategory("STANDARD"); setNewPresetNotes("");
    setShowAddPreset(false);
    loadAll();
  }

  // ── Template timings ──
  function getTaskEdit(templateId: string, taskId: string, field: "estMinutes" | "sprint" | "workCategory", fallback: number | string) {
    return templateEdits[templateId]?.[taskId]?.[field] ?? fallback;
  }

  function setTaskEdit(templateId: string, taskId: string, field: "estMinutes" | "sprint" | "workCategory", value: number | string) {
    setTemplateEdits((prev) => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        [taskId]: {
          ...(prev[templateId]?.[taskId] ?? {}),
          [field]: value,
        },
      },
    }));
  }

  async function saveTemplateTimings(template: Template) {
    const edits = templateEdits[template.id] ?? {};
    const tasks = template.tasks.map((t) => ({
      name: t.name,
      leadDays: t.leadDays,
      sprint: Number(edits[t.id]?.sprint ?? t.sprint),
      estMinutes: Number(edits[t.id]?.estMinutes ?? t.estMinutes),
      workCategory: String(edits[t.id]?.workCategory ?? t.workCategory),
    }));
    await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks }),
    });
    setTemplateSavedId(template.id);
    setTimeout(() => setTemplateSavedId(null), 2000);
    loadAll();
  }

  async function deleteAllTasks() {
    await fetch("/api/tasks", { method: "DELETE" });
    setDeleteAllConfirm(false);
    setDeleteAllDone(true);
    setTimeout(() => setDeleteAllDone(false), 3000);
  }

  if (loading) return <div className="text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="space-y-10 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>

      {/* ── Work Nights ── */}
      <section className="space-y-4">
        <div>
          <h2 className="font-medium">Work Nights</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Which evenings do you do focused grading & assessment work? Tasks tagged
            as <span className="font-medium">🌙 Work night</span> will be scheduled
            to the last selected day on or before their deadline.
          </p>
        </div>
        <div className="flex gap-2">
          {DAYS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => toggleDay(value)}
              className={`w-12 h-10 rounded text-sm font-medium transition-colors ${
                workNightDays.includes(value)
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400">
          {workNightDays.length === 0
            ? "No work nights selected — grading tasks will use a simple day buffer."
            : `Selected: ${workNightDays.map((d) => DAYS[d].label).join(", ")}`}
        </p>
        <Button onClick={saveSettings} size="sm">
          {settingsSaved ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-400" />Saved</> : "Save settings"}
        </Button>
      </section>

      <hr className="border-slate-200 dark:border-zinc-800" />

      {/* ── Personal Task Presets ── */}
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">My Task Presets</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Your personal timing library for recurring task types. These are used as quick-fill when adding tasks, and the AI brain dump parser uses them to suggest accurate estimates.
            </p>
          </div>
          {resetPresetsConfirm ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-zinc-500">Reset to defaults?</span>
              <button onClick={() => setResetPresetsConfirm(false)} className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
              <button onClick={resetPresets} className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors">Yes, reset</button>
            </div>
          ) : (
            <button onClick={() => setResetPresetsConfirm(true)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0 mt-0.5 transition-colors">Reset to defaults</button>
          )}
        </div>

        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-zinc-400 bg-slate-50 dark:bg-zinc-800">
            <div className="col-span-4">Task type</div>
            <div className="col-span-2">Sprint</div>
            <div className="col-span-1">Mins</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Notes</div>
            <div className="col-span-1"></div>
          </div>

          {presets.map((p) =>
            editingPresetId === p.id ? (
              <div key={p.id} className="px-4 py-2 space-y-2 bg-slate-50 dark:bg-zinc-800">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <Input value={editPresetName} onChange={(e) => setEditPresetName(e.target.value)} className="h-7 text-xs" autoFocus />
                  </div>
                  <div className="col-span-2">
                    <Select value={editPresetSprint} onValueChange={setEditPresetSprint}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4].map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <Input type="number" min="5" step="5" value={editPresetMins} onChange={(e) => setEditPresetMins(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Select value={editPresetCategory} onValueChange={setEditPresetCategory}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD" className="text-xs">📅 Prep</SelectItem>
                        <SelectItem value="GRADING" className="text-xs">🌙 Night</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input value={editPresetNotes} onChange={(e) => setEditPresetNotes(e.target.value)} placeholder="e.g. per class of 22" className="h-7 text-xs" />
                  </div>
                  <div className="col-span-1 flex gap-1">
                    <button onClick={() => setEditingPresetId(null)} className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors"><X className="h-3.5 w-3.5" /></button>
                    <button onClick={() => savePreset(p.id)} className="p-1 text-zinc-400 hover:text-green-600 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={p.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center group text-sm">
                <div className="col-span-4 font-medium text-sm truncate">{p.name}</div>
                <div className="col-span-2 text-xs" style={{ color: p.sprint === 1 ? "#E24B4A" : p.sprint === 2 ? "#BA7517" : p.sprint === 3 ? "#378ADD" : "#7F77DD" }}>
                  {SPRINT_LABELS[p.sprint]}
                </div>
                <div className="col-span-1 text-xs font-semibold tabular-nums">{formatMinutes(p.estMinutes)}</div>
                <div className="col-span-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded ${p.workCategory === "GRADING" ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                    {p.workCategory === "GRADING" ? "🌙 Night" : "📅 Prep"}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-zinc-400 truncate">{p.notes}</div>
                <div className="col-span-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEditPreset(p)} className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => deletePreset(p.id)} className="p-1 text-zinc-400 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )
          )}

          {/* Add new preset row */}
          {showAddPreset ? (
            <div className="px-4 py-2 space-y-2 bg-slate-50 dark:bg-zinc-800">
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <Input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} placeholder="Task type name" className="h-7 text-xs" autoFocus onKeyDown={(e) => e.key === "Enter" && addPreset()} />
                </div>
                <div className="col-span-2">
                  <Select value={newPresetSprint} onValueChange={setNewPresetSprint}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4].map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Input type="number" min="5" step="5" value={newPresetMins} onChange={(e) => setNewPresetMins(e.target.value)} className="h-7 text-xs" />
                </div>
                <div className="col-span-2">
                  <Select value={newPresetCategory} onValueChange={setNewPresetCategory}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD" className="text-xs">📅 Prep</SelectItem>
                      <SelectItem value="GRADING" className="text-xs">🌙 Night</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input value={newPresetNotes} onChange={(e) => setNewPresetNotes(e.target.value)} placeholder="e.g. per class of 22" className="h-7 text-xs" />
                </div>
                <div className="col-span-1 flex gap-1">
                  <button onClick={() => setShowAddPreset(false)} className="p-1 text-zinc-400 hover:text-zinc-700"><X className="h-3.5 w-3.5" /></button>
                  <button onClick={addPreset} className="p-1 text-zinc-400 hover:text-green-600"><Check className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddPreset(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add preset
            </button>
          )}
        </div>
      </section>

      <hr className="border-slate-200 dark:border-zinc-800" />

      {/* ── Template Timings ── */}
      <section className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-medium">Template Task Timings</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Adjust the default timings for each step in your project templates. Changes here affect future projects created from templates.
            </p>
          </div>
          <Link href="/templates" className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 mt-1 shrink-0">
            Full editor <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <div className="space-y-3">
          {templates.map((template) => {
            const isOpen = expandedTemplate === template.id;
            const hasEdits = Object.keys(templateEdits[template.id] ?? {}).length > 0;
            return (
              <div key={template.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                <button
                  onClick={() => setExpandedTemplate(isOpen ? null : template.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.label}</span>
                    <span className="text-xs text-zinc-400">{template.tasks.length} tasks</span>
                    {hasEdits && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">unsaved changes</span>
                    )}
                  </div>
                  <span className="text-zinc-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-zinc-400 bg-slate-50 dark:bg-zinc-800">
                      <div className="col-span-5">Task</div>
                      <div className="col-span-2">Sprint</div>
                      <div className="col-span-2">Minutes</div>
                      <div className="col-span-3">Category</div>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {template.tasks.map((task) => {
                        const mins = Number(getTaskEdit(template.id, task.id, "estMinutes", task.estMinutes));
                        const sprint = Number(getTaskEdit(template.id, task.id, "sprint", task.sprint));
                        const category = String(getTaskEdit(template.id, task.id, "workCategory", task.workCategory));
                        const changed = mins !== task.estMinutes || sprint !== task.sprint || category !== task.workCategory;
                        return (
                          <div
                            key={task.id}
                            className={`grid grid-cols-12 gap-2 px-4 py-2 items-center ${changed ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
                          >
                            <div className="col-span-5 text-xs text-zinc-700 dark:text-zinc-300 truncate" title={task.name}>
                              {task.name}
                            </div>
                            <div className="col-span-2">
                              <Select
                                value={String(sprint)}
                                onValueChange={(v) => setTaskEdit(template.id, task.id, "sprint", parseInt(v))}
                              >
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[1,2,3,4].map((s) => <SelectItem key={s} value={String(s)} className="text-xs">S{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-2">
                              <Input
                                type="number"
                                min="5"
                                step="5"
                                value={mins}
                                onChange={(e) => setTaskEdit(template.id, task.id, "estMinutes", parseInt(e.target.value) || 30)}
                                className={`h-7 text-xs ${changed ? "border-amber-400 dark:border-amber-600" : ""}`}
                              />
                            </div>
                            <div className="col-span-3">
                              <Select
                                value={category}
                                onValueChange={(v) => setTaskEdit(template.id, task.id, "workCategory", v)}
                              >
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="STANDARD" className="text-xs">📅 Prep</SelectItem>
                                  <SelectItem value="GRADING" className="text-xs">🌙 Night</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-2.5 flex justify-end border-t border-zinc-100 dark:border-zinc-800">
                      <Button
                        size="sm"
                        onClick={() => saveTemplateTimings(template)}
                        disabled={!hasEdits}
                        variant={hasEdits ? "default" : "ghost"}
                      >
                        {templateSavedId === template.id ? (
                          <><Check className="h-3.5 w-3.5 mr-1.5 text-green-400" />Saved</>
                        ) : (
                          "Save timings"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Note */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 text-xs text-zinc-500 space-y-1">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Note on work nights</p>
        <p>Changing work nights only affects tasks created or edited after saving. To update existing tasks, open them in Sprints or Tasks and re-save.</p>
      </div>

      <hr className="border-slate-200 dark:border-zinc-800" />

      {/* ── Danger Zone ── */}
      <section className="space-y-4">
        <div>
          <h2 className="font-medium text-red-600 dark:text-red-400">Danger Zone</h2>
          <p className="text-xs text-zinc-500 mt-1">Irreversible actions. Be careful.</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-900 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Delete all tasks</p>
            <p className="text-xs text-zinc-500 mt-0.5">Permanently removes every task in your account. Projects and templates are unaffected.</p>
          </div>
          {deleteAllDone ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 shrink-0">
              <Check className="h-3.5 w-3.5" /> All tasks deleted
            </span>
          ) : deleteAllConfirm ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-zinc-500">Are you sure?</span>
              <button
                onClick={() => setDeleteAllConfirm(false)}
                className="text-xs px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteAllTasks}
                className="text-xs px-2.5 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Yes, delete all
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteAllConfirm(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete all tasks
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
