"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Sparkles,
  CheckCircle2,
  Circle,
  Plus,
  Loader2,
  Clock,
  Moon,
  CalendarClock,
  Zap,
  ChevronDown,
  ChevronUp,
  Trophy,
} from "lucide-react";
import {
  formatMinutes,
  formatRelativeDate,
  SPRINT_LABELS,
  SPRINT_COLORS,
} from "@/lib/utils";
import { format, startOfDay, startOfWeek, parseISO, addDays, differenceInCalendarDays } from "date-fns";

interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  done: boolean;
  doneAt: string | null;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  project: { id: string; name: string } | null;
}

interface DailyLog {
  highlight: string;
  highlightDone: boolean;
  microCommitment: string;
  microDone: boolean;
  brainDump: string;
}

interface ParsedTask {
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  deadline: string; // YYYY-MM-DD, defaults to today
  selected: boolean;
}

function getMomentumMessage(doneToday: number): string {
  if (doneToday === 0) return "Ready to make progress today?";
  if (doneToday === 1) return "First one down. That's how it starts.";
  if (doneToday === 2) return "Good momentum. Keep going.";
  if (doneToday <= 4) return "You're in the zone today.";
  if (doneToday <= 6) return "Strong day. This is real progress.";
  return "You're absolutely crushing it today.";
}

function computeStreak(tasks: Task[]): number {
  const today = startOfDay(new Date());
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, -i);
    const dayEnd = addDays(day, 1);
    const hadCompletion = tasks.some((t) => {
      if (!t.done || !t.doneAt) return false;
      const d = new Date(t.doneAt);
      return d >= day && d < dayEnd;
    });
    if (hadCompletion) {
      streak++;
    } else if (i > 0) {
      break; // gap in streak
    }
  }
  return streak;
}

export default function DailyPage() {
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");

  const [log, setLog] = useState<DailyLog>({
    highlight: "",
    highlightDone: false,
    microCommitment: "",
    microDone: false,
    brainDump: "",
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWeekGain, setShowWeekGain] = useState(false);

  const loadData = useCallback(async () => {
    const [logRes, tasksRes] = await Promise.all([
      fetch(`/api/daily?date=${todayStr}`),
      fetch("/api/tasks"),
    ]);
    const logData = await logRes.json();
    const tasksData = await tasksRes.json();
    if (logData) setLog(logData);
    setTasks(tasksData);
  }, [todayStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveLog(update: Partial<DailyLog>) {
    const next = { ...log, ...update };
    setLog(next);
    await fetch("/api/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayStr, ...next }),
    });
  }

  async function parseBrainDump() {
    if (!log.brainDump.trim()) return;
    setParsing(true);
    try {
      const res = await fetch("/api/ai/parse-braindump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: log.brainDump }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`AI parsing failed (${res.status}): ${data.error ?? "Unknown error"}`);
        return;
      }
      setParsedTasks(
        (data.tasks || []).map((t: Omit<ParsedTask, "selected">) => ({
          ...t,
          deadline: t.deadline || todayStr,
          selected: true,
        }))
      );
    } catch (err) {
      alert(`AI parsing failed: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setParsing(false);
    }
  }

  async function saveSelectedTasks() {
    setSaving(true);
    const toSave = parsedTasks.filter((t) => t.selected);
    await Promise.all(
      toSave.map((t) =>
        fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: t.name, sprint: t.sprint, estMinutes: t.estMinutes, workCategory: t.workCategory ?? "STANDARD", deadline: t.deadline || null }),
        })
      )
    );
    setParsedTasks([]);
    setSaving(false);
    loadData();
  }

  async function toggleTask(id: string, done: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    loadData();
  }

  // ── Date anchors ──
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday

  // ── Task buckets ──
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  // Done today
  const doneToday = doneTasks.filter((t) => {
    if (!t.doneAt) return false;
    return startOfDay(new Date(t.doneAt)) >= today;
  });

  // Done this week (not today — shown separately)
  const doneThisWeek = doneTasks.filter((t) => {
    if (!t.doneAt) return false;
    const d = startOfDay(new Date(t.doneAt));
    return d >= weekStart && d < today;
  });

  const weekTotalMins = [...doneToday, ...doneThisWeek].reduce(
    (s, t) => s + t.estMinutes, 0
  );
  const weekTaskCount = doneToday.length + doneThisWeek.length;
  const streak = computeStreak(tasks);

  // ⚡ Auto-escalated: deadline <= tomorrow, from ANY sprint
  const urgentNow = openTasks.filter((t) => {
    if (!t.deadline) return false;
    const dl = startOfDay(parseISO(t.deadline));
    return dl <= tomorrow;
  });
  const urgentIds = new Set(urgentNow.map((t) => t.id));

  // Sort helper: by sprint, then by deadline soonest-first
  function sortBySprintThenDeadline(list: Task[]) {
    return [...list].sort((a, b) => {
      if (a.sprint !== b.sprint) return a.sprint - b.sprint;
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
    });
  }

  // Today's scheduled work (excludes urgentNow to avoid duplication)
  const todaysTasks = openTasks.filter((t) => {
    if (urgentIds.has(t.id)) return false;
    if (!t.scheduledDate) return false;
    return startOfDay(parseISO(t.scheduledDate)) <= today;
  });

  // Group today's tasks by sprint
  const todaysBySprint = [1, 2, 3, 4]
    .map((sprint) => ({
      sprint,
      tasks: todaysTasks.filter((t) => t.sprint === sprint),
    }))
    .filter((g) => g.tasks.length > 0);

  const totalTodayMins =
    todaysTasks.reduce((s, t) => s + t.estMinutes, 0) +
    urgentNow.reduce((s, t) => s + t.estMinutes, 0);

  // Coming up (next 7 days, not today)
  const upcoming = openTasks
    .filter((t) => {
      if (!t.scheduledDate) return false;
      const d = startOfDay(parseISO(t.scheduledDate));
      return d > today && d <= addDays(today, 7);
    })
    .sort((a, b) => {
      if (!a.scheduledDate || !b.scheduledDate) return 0;
      return parseISO(a.scheduledDate).getTime() - parseISO(b.scheduledDate).getTime();
    });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        {format(new Date(), "EEEE, d MMMM")}
      </h1>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Done today", value: doneToday.length, accent: doneToday.length > 0 },
          { label: "Done this week", value: weekTaskCount },
          { label: "Scheduled today", value: todaysTasks.length + urgentNow.length },
          { label: "Est. today", value: formatMinutes(totalTodayMins), icon: Clock },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div
            key={label}
            className={`rounded-xl border p-4 ${
              accent
                ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950"
                : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
            }`}
          >
            <div className="text-xs text-slate-400 dark:text-zinc-500 mb-1">{label}</div>
            <div className={`text-lg font-semibold flex items-center gap-1 ${accent ? "text-green-700 dark:text-green-400" : ""}`}>
              {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-zinc-500" />}
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── THE GAIN — Did List ── */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-sm">The Gain</span>
            {weekTaskCount > 0 && (
              <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
                {weekTaskCount} task{weekTaskCount !== 1 ? "s" : ""} this week · {formatMinutes(weekTotalMins)}
              </span>
            )}
            {streak > 1 && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                🔥 {streak}-day streak
              </span>
            )}
          </div>
        </div>

        {/* Today's completions */}
        <div className="px-4 py-3">
          {doneToday.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-zinc-500 italic">Nothing done yet today — that changes the moment you tick your first task.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mb-2">
                Today — {getMomentumMessage(doneToday.length)}
              </p>
              {doneToday.map((task) => (
                <div key={task.id} className="flex items-center gap-2.5">
                  <button onClick={() => toggleTask(task.id, false)} className="shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </button>
                  <span className="text-sm text-slate-600 dark:text-zinc-400 line-through">
                    {task.name}
                  </span>
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-slate-400 dark:text-zinc-500 ml-auto tabular-nums">
                    {formatMinutes(task.estMinutes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* This week (collapsible) */}
        {doneThisWeek.length > 0 && (
          <div className="border-t border-slate-100 dark:border-zinc-800">
            <button
              onClick={() => setShowWeekGain((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <span>Earlier this week — {doneThisWeek.length} more task{doneThisWeek.length !== 1 ? "s" : ""}</span>
              {showWeekGain ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showWeekGain && (
              <div className="px-4 pb-3 space-y-1.5">
                {doneThisWeek.map((task) => (
                  <div key={task.id} className="flex items-center gap-2.5 opacity-60">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm line-through text-slate-500 dark:text-zinc-400">{task.name}</span>
                    {task.doneAt && (
                      <span className="text-xs text-slate-400 dark:text-zinc-500 ml-auto shrink-0">
                        {format(new Date(task.doneAt), "EEE")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ⚡ AUTO-ESCALATED: Due very soon ── */}
      {urgentNow.length > 0 && (
        <div className="rounded border-2 border-red-300 dark:border-red-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800">
            <Zap className="h-4 w-4 text-red-500" />
            <span className="font-medium text-sm text-red-700 dark:text-red-400">Due Very Soon</span>
            <span className="text-xs text-red-500 ml-1">
              — these tasks need attention today regardless of sprint
            </span>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900">
            {urgentNow.map((task) => {
              const dl = task.deadline ? startOfDay(parseISO(task.deadline)) : null;
              const daysLeft = dl ? differenceInCalendarDays(dl, today) : null;
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-zinc-950">
                  <button onClick={() => toggleTask(task.id, true)}>
                    <Circle className="h-4 w-4 text-red-300 hover:text-green-500 transition-colors" />
                  </button>
                  <span className="flex-1 text-sm font-medium">{task.name}</span>
                  {task.workCategory === "GRADING" && (
                    <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  )}
                  {task.project && (
                    <span className="text-xs text-slate-400 dark:text-zinc-500 hidden sm:block shrink-0">{task.project.name}</span>
                  )}
                  <span className={`text-xs font-semibold shrink-0 ${
                    daysLeft !== null && daysLeft < 0 ? "text-red-600" :
                    daysLeft === 0 ? "text-red-600" : "text-amber-600"
                  }`}>
                    {daysLeft === null ? "" :
                     daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
                     daysLeft === 0 ? "due today" :
                     "due tomorrow"}
                  </span>
                  <SprintBadge sprint={task.sprint} size="sm" />
                  <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Today's scheduled work ── */}
      <div className="space-y-3">
        <h2 className="font-bold text-sm text-slate-900 dark:text-white">Today&apos;s Work</h2>
        {todaysBySprint.length === 0 && urgentNow.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center text-sm text-slate-400 dark:text-zinc-500">
            Nothing scheduled for today. Check Sprints or use Brain Dump below.
          </div>
        ) : todaysBySprint.length === 0 ? null : (
          <div className="space-y-3">
            {todaysBySprint.map(({ sprint, tasks: sprintTasks }) => {
              const color = SPRINT_COLORS[sprint];
              const sprintMins = sprintTasks.reduce((s, t) => s + t.estMinutes, 0);
              return (
                <div key={sprint} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs font-medium">{SPRINT_LABELS[sprint]}</span>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-zinc-500">{formatMinutes(sprintMins)}</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {sprintTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                        <button onClick={() => toggleTask(task.id, true)}>
                          <Circle className="h-4 w-4 text-slate-300 dark:text-zinc-600 hover:text-green-500 transition-colors" />
                        </button>
                        <span className="flex-1 text-sm">{task.name}</span>
                        {task.workCategory === "GRADING" && (
                          <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        )}
                        {task.project && (
                          <span className="text-xs text-slate-400 dark:text-zinc-500 hidden sm:block shrink-0">{task.project.name}</span>
                        )}
                        {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
                        {task.deadline && (
                          <span className="text-xs text-slate-400 dark:text-zinc-500 shrink-0">
                            due {formatRelativeDate(task.deadline)}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Today's Highlight + Micro-commitment ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">Today&apos;s Highlight</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">The ONE thing that would make today a win.</p>
          <Select
            value={log.highlight || ""}
            onValueChange={(v) => saveLog({ highlight: v })}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Pick a task as your highlight…" />
            </SelectTrigger>
            <SelectContent>
              {sortBySprintThenDeadline([...urgentNow, ...todaysTasks]).map((t) => (
                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
              ))}
              {sortBySprintThenDeadline(
                openTasks.filter((t) => !urgentIds.has(t.id) && !todaysTasks.includes(t))
              ).map((t) => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Or type your own highlight…"
            value={log.highlight}
            onChange={(e) => setLog({ ...log, highlight: e.target.value })}
            onBlur={() => saveLog({ highlight: log.highlight })}
          />
          <button
            onClick={() => saveLog({ highlightDone: !log.highlightDone })}
            className="flex items-center gap-2 text-sm"
          >
            {log.highlightDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-slate-300 dark:text-zinc-600" />
            )}
            <span className={log.highlightDone ? "line-through text-slate-400 dark:text-zinc-500" : ""}>
              {log.highlight || "Set a highlight above"}
            </span>
          </button>
        </div>

        <div className="space-y-3">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">Micro-commitment</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">The smallest next action you can definitely do.</p>
          <Input
            placeholder="e.g. Open feedback doc and write first comment"
            value={log.microCommitment}
            onChange={(e) => setLog({ ...log, microCommitment: e.target.value })}
            onBlur={() => saveLog({ microCommitment: log.microCommitment })}
          />
          <button
            onClick={() => saveLog({ microDone: !log.microDone })}
            className="flex items-center gap-2 text-sm"
          >
            {log.microDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-slate-300 dark:text-zinc-600" />
            )}
            <span className={log.microDone ? "line-through text-slate-400 dark:text-zinc-500" : ""}>
              {log.microCommitment || "Set your micro-commitment above"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Brain Dump ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Brain Dump</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Get it out of your head. One thought per line or just free-write.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={parseBrainDump}
            disabled={parsing || !log.brainDump.trim()}
          >
            {parsing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            Convert to tasks ↗
          </Button>
        </div>
        <Textarea
          rows={5}
          placeholder="Mark feedback for Year 10, email HOD about field trip, prep materials for Tuesday practical…"
          value={log.brainDump}
          onChange={(e) => setLog({ ...log, brainDump: e.target.value })}
          onBlur={() => saveLog({ brainDump: log.brainDump })}
        />
      </div>

      {/* Parsed tasks */}
      {parsedTasks.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">
              AI found {parsedTasks.length} task{parsedTasks.length !== 1 ? "s" : ""}
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setParsedTasks([])}>Cancel</Button>
              <Button size="sm" onClick={saveSelectedTasks} disabled={saving || parsedTasks.every((t) => !t.selected)}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Add selected
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {parsedTasks.map((task, i) => {
              function update(patch: Partial<ParsedTask>) {
                const next = [...parsedTasks];
                next[i] = { ...task, ...patch };
                setParsedTasks(next);
              }
              return (
                <div key={i} className={`rounded-lg border p-3 space-y-2 transition-colors ${task.selected ? "border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50" : "border-transparent opacity-50"}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.selected}
                      onChange={(e) => update({ selected: e.target.checked })}
                      className="rounded"
                    />
                    <span className="flex-1 text-sm font-medium">{task.name}</span>
                    <span className="text-slate-400 dark:text-zinc-500 text-xs shrink-0">{formatMinutes(task.estMinutes)}</span>
                  </label>
                  {task.selected && (
                    <div className="flex items-center gap-2 pl-5">
                      <Select value={String(task.sprint)} onValueChange={(v) => update({ sprint: parseInt(v) })}>
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4].map((s) => (
                            <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        value={task.deadline}
                        onChange={(e) => update({ deadline: e.target.value })}
                        className="h-7 text-xs w-36"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Coming Up ── */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
            Coming Up
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {upcoming.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-2 text-slate-500 dark:text-zinc-400">
                <span className="w-20 text-xs font-medium text-slate-400 dark:text-zinc-500 shrink-0">
                  {formatRelativeDate(task.scheduledDate)}
                </span>
                <span className="flex-1 text-sm">{task.name}</span>
                {task.workCategory === "GRADING" && (
                  <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                )}
                <SprintBadge sprint={task.sprint} size="sm" />
                <span className="text-xs tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
