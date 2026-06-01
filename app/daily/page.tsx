"use client";

import { useState, useEffect, useCallback } from "react";
import { useModeContext, type Mode } from "@/components/ModeProvider";
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
  GripVertical,
  Pencil,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
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
  context: string;
  url: string | null;
  project: { id: string; name: string } | null;
}

interface DailyLog {
  highlight: string;
  highlightDone: boolean;
  microCommitment: string;
  microDone: boolean;
  brainDump: string;
  forageOrder: string;
  flaggedForageIds?: string;
}

interface ParsedTask {
  name: string;
  sprint: number;
  estMinutes: number;
  workCategory: string;
  deadline: string; // YYYY-MM-DD, defaults to today
  url: string | null;
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

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s,)"']+/g;
  return Array.from(new Set(text.match(urlRegex) ?? []));
}

function RainbowIcon({ active }: { active: boolean }) {
  const colors = active
    ? ["#FF0080", "#FF8800", "#44CC66", "#4499FF"]
    : ["#888", "#888", "#888", "#888"];
  return (
    <svg width="16" height="10" viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 11 C1 6, 5 1, 10 1 C15 1, 19 6, 19 11"             stroke={colors[0]} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M3.5 11 C3.5 7, 6.5 3.5, 10 3.5 C13.5 3.5, 16.5 7, 16.5 11" stroke={colors[1]} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M6 11 C6 8, 7.8 6, 10 6 C12.2 6, 14 8, 14 11"         stroke={colors[2]} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M8.5 11 C8.5 9.5, 9.1 8.5, 10 8.5 C10.9 8.5, 11.5 9.5, 11.5 11" stroke={colors[3]} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export default function DailyPage() {
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
  const { mode } = useModeContext();

  const headingCls = mode === "PERSONAL" ? "text-lime-900" : "text-slate-900 dark:text-white";
  const mutedCls   = mode === "PERSONAL" ? "text-yellow-700" : "text-zinc-500 dark:text-zinc-400";
  const cardCls    = mode === "PERSONAL"
    ? "bg-white dark:bg-zinc-900 border-yellow-200 dark:border-yellow-900"
    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800";

  const [log, setLog] = useState<DailyLog>({
    highlight: "",
    highlightDone: false,
    microCommitment: "",
    microDone: false,
    brainDump: "",
    forageOrder: "",
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWeekGain, setShowWeekGain] = useState(false);
  const [enrichedLinks, setEnrichedLinks] = useState<{ url: string; title: string | null }[]>([]);
  const [gainInput, setGainInput] = useState("");
  const [addingToGain, setAddingToGain] = useState(false);
  const [urgentCustomOrder, setUrgentCustomOrder] = useState<string[]>([]);
  const [flaggedForageIds, setFlaggedForageIds] = useState<string[]>([]);
  const [editingUrgentId, setEditingUrgentId] = useState<string | null>(null);
  const [editUrgentName, setEditUrgentName] = useState("");
  const [editUrgentSprint, setEditUrgentSprint] = useState("1");
  const [editUrgentDeadline, setEditUrgentDeadline] = useState("");
  const [editUrgentEst, setEditUrgentEst] = useState("30");
  const [editUrgentContext, setEditUrgentContext] = useState<Mode>("PROFESSIONAL");

  const loadData = useCallback(async () => {
    await fetch("/api/recurring/spawn", { method: "POST" });
    const [logRes, tasksRes] = await Promise.all([
      fetch(`/api/daily?date=${todayStr}`),
      fetch(`/api/tasks?context=${mode}`),
    ]);
    const logData = await logRes.json();
    const tasksData = await tasksRes.json();
    if (logData) {
      setLog(logData);
      if (logData.forageOrder) {
        try { setUrgentCustomOrder(JSON.parse(logData.forageOrder)); } catch { /* ignore corrupt data */ }
      }
      if (logData.flaggedForageIds) {
        try { setFlaggedForageIds(JSON.parse(logData.flaggedForageIds)); } catch { /* ignore */ }
      }
    }
    setTasks(tasksData);
  }, [todayStr, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep urgentCustomOrder in sync when tasks change (preserves manual order, appends new items)
  useEffect(() => {
    const now = startOfDay(new Date());
    const urgentIds = new Set(
      tasks
        .filter((t) => {
          if (t.done) return false;
          if (!t.deadline) return false;
          return startOfDay(parseISO(t.deadline)) <= now;
        })
        .map((t) => t.id)
    );
    setUrgentCustomOrder((prev) => {
      const kept = prev.filter((id) => urgentIds.has(id));
      const keptSet = new Set(kept);
      const newIds = [...urgentIds].filter((id) => !keptSet.has(id));
      return [...kept, ...newIds];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

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
          url: t.url ?? null,
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
          body: JSON.stringify({ name: t.name, sprint: t.sprint, estMinutes: t.estMinutes, workCategory: t.workCategory ?? "STANDARD", deadline: t.deadline || null, url: t.url || null, context: mode }),
        })
      )
    );
    setParsedTasks([]);
    setSaving(false);
    loadData();
  }

  useEffect(() => {
    if (parsedTasks.length === 0) { setEnrichedLinks([]); return; }
    const urls = extractUrls(log.brainDump);
    if (urls.length === 0) { setEnrichedLinks([]); return; }

    setEnrichedLinks(urls.map((url) => ({ url, title: null })));

    urls.forEach(async (url) => {
      try {
        const res = await fetch(`/api/fetch-title?url=${encodeURIComponent(url)}`);
        const { title } = await res.json();
        setEnrichedLinks((prev) =>
          prev.map((l) => (l.url === url ? { url, title } : l))
        );
      } catch {
        // title stays null — bare URL shown as fallback
      }
    });
  }, [parsedTasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleForageFlag(taskId: string) {
    const prev = flaggedForageIds;
    const next = prev.includes(taskId)
      ? prev.filter((id) => id !== taskId)
      : [...prev, taskId];
    setFlaggedForageIds(next);
    try {
      await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayStr, flaggedForageIds: JSON.stringify(next) }),
      });
    } catch {
      setFlaggedForageIds(prev);
    }
  }

  async function toggleTask(id: string, done: boolean) {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, done, doneAt: done ? now : null } : t)
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    loadData();
  }

  async function addToGain(e: React.FormEvent) {
    e.preventDefault();
    if (!gainInput.trim() || addingToGain) return;
    setAddingToGain(true);
    const name = gainInput.trim();
    setGainInput("");
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sprint: 1, estMinutes: 30, workCategory: "STANDARD", done: true, context: mode }),
      });
      loadData();
    } finally {
      setAddingToGain(false);
    }
  }

  function handleUrgentDragEnd(result: DropResult) {
    if (!result.destination) return;
    const next = [...urgentCustomOrder];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setUrgentCustomOrder(next);
    fetch("/api/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayStr, forageOrder: JSON.stringify(next) }),
    });
  }

  function startEditUrgent(task: Task) {
    setEditingUrgentId(task.id);
    setEditUrgentName(task.name);
    setEditUrgentSprint(String(task.sprint));
    setEditUrgentDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setEditUrgentEst(String(task.estMinutes));
    setEditUrgentContext((task.context as Mode) ?? "PROFESSIONAL");
  }

  async function saveEditUrgent(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editUrgentName,
        sprint: parseInt(editUrgentSprint),
        deadline: editUrgentDeadline || null,
        estMinutes: parseInt(editUrgentEst),
        context: editUrgentContext,
      }),
    });
    if (!res.ok) return;
    setEditingUrgentId(null);
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

  // ⚡ Auto-escalated: deadline is today, from ANY sprint
  const urgentNow = openTasks.filter((t) => {
    if (!t.deadline) return false;
    const dl = startOfDay(parseISO(t.deadline));
    return dl <= today;
  });
  const urgentIds = new Set(urgentNow.map((t) => t.id));

  const urgentDisplayed =
    urgentCustomOrder.length > 0
      ? urgentCustomOrder
          .map((id) => urgentNow.find((t) => t.id === id))
          .filter((t): t is Task => t !== undefined)
      : urgentNow;

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
      <div>
        <h1 className={`text-xl font-bold ${headingCls}`}>
          {format(new Date(), "EEEE, d MMMM")}
        </h1>
        <p className={`text-xs ${mutedCls} mt-0.5`}>Your command centre for today — what&apos;s due, what&apos;s done, and what&apos;s coming up.</p>
      </div>

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
                : cardCls
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
      <div className={`rounded-xl border ${cardCls} overflow-hidden`}>
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

        {/* Quick add to gain */}
        <form onSubmit={addToGain} className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <Plus className="h-4 w-4 text-slate-300 dark:text-zinc-600 shrink-0" />
          <input
            type="text"
            placeholder="Log something you just did…"
            value={gainInput}
            onChange={(e) => setGainInput(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-300 dark:placeholder:text-zinc-600 text-slate-700 dark:text-zinc-300"
          />
          {gainInput.trim() && (
            <button type="submit" disabled={addingToGain} className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0 disabled:opacity-50">
              {addingToGain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </button>
          )}
        </form>

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

      {/* ── 🍇 TODAY'S FORAGE ── */}
      {urgentDisplayed.length > 0 && (
        <div className="rounded border-2 border-purple-300 dark:border-purple-800 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-950 border-b border-purple-200 dark:border-purple-800">
            <Zap className="h-4 w-4 text-purple-500" />
            <span className="font-medium text-sm text-purple-700 dark:text-purple-400">Today's Forage</span>
            <span className="text-xs text-purple-500 ml-1">
              — these tasks need attention today regardless of sprint
            </span>
          </div>
          <DragDropContext onDragEnd={handleUrgentDragEnd}>
            <Droppable droppableId="urgent-now">
              {(provided) => (
                <div
                  className="divide-y divide-purple-100 dark:divide-purple-900"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {urgentDisplayed.map((task, index) => {
                    const dl = task.deadline ? startOfDay(parseISO(task.deadline)) : null;
                    const daysLeft = dl ? differenceInCalendarDays(dl, today) : null;
                    return (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={flaggedForageIds.includes(task.id) ? "forage-flagged" : "bg-white dark:bg-zinc-950"}
                            style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}`, ...provided.draggableProps.style }}
                          >
                            {editingUrgentId === task.id ? (
                              <div className="px-4 py-3 space-y-2 bg-purple-50 dark:bg-purple-950">
                                <Input
                                  value={editUrgentName}
                                  onChange={(e) => setEditUrgentName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveEditUrgent(task.id);
                                    if (e.key === "Escape") setEditingUrgentId(null);
                                  }}
                                  autoFocus
                                  className="text-sm"
                                />
                                <div className="flex items-center gap-2">
                                  <Select value={editUrgentSprint} onValueChange={setEditUrgentSprint}>
                                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {[1, 2, 3, 4].map((s) => (
                                        <SelectItem key={s} value={String(s)} className="text-xs">{SPRINT_LABELS[s]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="date"
                                    value={editUrgentDeadline}
                                    onChange={(e) => setEditUrgentDeadline(e.target.value)}
                                    className="h-8 text-xs w-36"
                                  />
                                  <Input
                                    type="number"
                                    min="5"
                                    step="5"
                                    value={editUrgentEst}
                                    onChange={(e) => setEditUrgentEst(e.target.value)}
                                    className="h-8 text-xs w-24"
                                    placeholder="Est. mins"
                                  />
                                  <div className="bg-stone-800 rounded-full p-0.5 flex gap-0.5 border border-stone-700 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setEditUrgentContext("PROFESSIONAL")}
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editUrgentContext === "PROFESSIONAL" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
                                    >
                                      💼 Pro
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditUrgentContext("PERSONAL")}
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${editUrgentContext === "PERSONAL" ? "bg-green-600 text-white" : "text-slate-400 hover:text-white"}`}
                                    >
                                      🌿 Home
                                    </button>
                                  </div>
                                  <div className="flex gap-2 ml-auto">
                                    <Button variant="ghost" size="sm" onClick={() => setEditingUrgentId(null)}>
                                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                    </Button>
                                    <Button size="sm" onClick={() => saveEditUrgent(task.id)}>
                                      <Check className="h-3.5 w-3.5 mr-1" /> Save
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 px-4 py-2.5 group">
                                <span
                                  {...provided.dragHandleProps}
                                  className="text-purple-200 dark:text-purple-900 cursor-grab active:cursor-grabbing shrink-0"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </span>
                                <button onClick={() => toggleTask(task.id, true)}>
                                  <Circle className="h-4 w-4 text-purple-300 hover:text-green-500 transition-colors" />
                                </button>
                                <span className="flex-1 text-sm font-medium">{task.name}</span>
                                {task.url && (
                                  <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors shrink-0" title={task.url}>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {task.workCategory === "GRADING" && (
                                  <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                )}
                                {task.project && (
                                  <span className="text-xs text-slate-400 dark:text-zinc-500 hidden sm:block shrink-0">{task.project.name}</span>
                                )}
                                <span className={`text-xs font-semibold shrink-0 ${
                                  daysLeft !== null && daysLeft < 0 ? "text-purple-600" :
                                  daysLeft === 0 ? "text-purple-600" : "text-amber-600"
                                }`}>
                                  {daysLeft === null ? "" :
                                   daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` :
                                   daysLeft === 0 ? "due today" :
                                   "due tomorrow"}
                                </span>
                                <SprintBadge sprint={task.sprint} size="sm" />
                                <span className="text-xs text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">{formatMinutes(task.estMinutes)}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleForageFlag(task.id); }}
                                  className={`p-1 rounded transition-all shrink-0 ${
                                    flaggedForageIds.includes(task.id) ? "opacity-100" : "opacity-30 hover:opacity-60"
                                  }`}
                                  title="Flag for this sitting"
                                >
                                  <RainbowIcon active={flaggedForageIds.includes(task.id)} />
                                </button>
                                <button
                                  onClick={() => startEditUrgent(task)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-300 hover:text-purple-600 transition-colors shrink-0"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {/* ── Fertile Ground ── */}
      <div className="rounded-xl bg-stone-200 dark:bg-stone-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-stone-700 dark:text-stone-300">🌱 Fertile Ground</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Drop seeds here. One thought per line or free-write.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={parseBrainDump}
            disabled={parsing || !log.brainDump.trim()}
            className="border-stone-400 text-stone-700 hover:bg-stone-300 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 bg-transparent"
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
          placeholder="Mark feedback for Year 10, email HOD about field trip, prep Tuesday practical…"
          value={log.brainDump}
          onChange={(e) => setLog({ ...log, brainDump: e.target.value })}
          onBlur={() => saveLog({ brainDump: log.brainDump })}
          className="bg-stone-100 text-stone-800 placeholder:text-stone-400 border-stone-300 dark:bg-stone-950 dark:text-stone-200 dark:placeholder:text-stone-600 dark:border-stone-700 resize-none"
        />
      </div>

      {/* Parsed tasks */}
      {parsedTasks.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">
              AI found {parsedTasks.length} task{parsedTasks.length !== 1 ? "s" : ""}
            </h3>
            {enrichedLinks.length > 0 && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 px-3 py-2">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5">Links detected</p>
                <div className="space-y-1">
                  {enrichedLinks.map(({ url, title }) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                    >
                      {title ?? url}
                    </a>
                  ))}
                </div>
              </div>
            )}
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
                    {task.url && (
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 shrink-0 max-w-[120px] truncate"
                        title={task.url}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {(() => { try { return new URL(task.url).hostname; } catch { return task.url; } })()}
                      </a>
                    )}
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

      {/* ── ☀️ Sunshine + 🌱 Sprout ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Sunshine */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-yellow-50 dark:bg-[#1c1a0f] p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-[#A16207] dark:text-amber-200">☀️ Sunshine</h2>
            <p className="text-xs text-[#A16207]/80 dark:text-amber-200/70 mt-0.5">The ONE thing that would make today a win.</p>
          </div>
          <Select
            value={log.highlight || ""}
            onValueChange={(v) => saveLog({ highlight: v })}
          >
            <SelectTrigger className="text-sm border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900">
              <SelectValue placeholder="Pick a task as your sunshine…" />
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
            placeholder="Or type your own sunshine…"
            value={log.highlight}
            onChange={(e) => setLog({ ...log, highlight: e.target.value })}
            onBlur={() => saveLog({ highlight: log.highlight })}
            className="border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900"
          />
          <button
            onClick={() => saveLog({ highlightDone: !log.highlightDone })}
            className="flex items-center gap-2 text-sm"
          >
            {log.highlightDone ? (
              <CheckCircle2 className="h-5 w-5 text-amber-500" />
            ) : (
              <Circle className="h-5 w-5 text-amber-200 dark:text-amber-900" />
            )}
            <span className={log.highlightDone ? "line-through text-amber-400 dark:text-amber-700" : "text-[#A16207] dark:text-amber-200"}>
              {log.highlight || "Set your sunshine above"}
            </span>
          </button>
        </div>

        {/* Sprout */}
        <div className="rounded-xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-[#052e16] p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-green-800 dark:text-green-300">🌱 Sprout</h2>
            <p className="text-xs text-green-800/70 dark:text-green-300/70 mt-0.5">The smallest next action you can start right now.</p>
          </div>
          <Input
            placeholder="e.g. Open the feedback doc"
            value={log.microCommitment}
            onChange={(e) => setLog({ ...log, microCommitment: e.target.value })}
            onBlur={() => saveLog({ microCommitment: log.microCommitment })}
            className="border-green-300 dark:border-green-800 bg-white dark:bg-zinc-900"
          />
          <button
            onClick={() => saveLog({ microDone: !log.microDone })}
            className="flex items-center gap-2 text-sm"
          >
            {log.microDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-green-300 dark:text-green-800" />
            )}
            <span className={log.microDone ? "line-through text-green-400 dark:text-green-700" : "text-green-800 dark:text-green-300"}>
              {log.microCommitment || "Set your sprout above"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Today's scheduled work ── */}
      <div className="space-y-3">
        <h2 className={`font-bold text-sm ${headingCls}`}>Today&apos;s Work</h2>
        {todaysBySprint.length === 0 && urgentNow.length === 0 ? (
          <div className={`rounded-xl border ${cardCls} p-6 text-center text-sm text-slate-400 dark:text-zinc-500`}>
            Nothing scheduled for today. Check Sprints or add via Fertile Ground above.
          </div>
        ) : todaysBySprint.length === 0 ? null : (
          <div className="space-y-3">
            {todaysBySprint.map(({ sprint, tasks: sprintTasks }) => {
              const color = SPRINT_COLORS[sprint];
              const sprintMins = sprintTasks.reduce((s, t) => s + t.estMinutes, 0);
              return (
                <div key={sprint} className={`rounded-xl border ${cardCls}`}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs font-medium">{SPRINT_LABELS[sprint]}</span>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-zinc-500">{formatMinutes(sprintMins)}</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {sprintTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}` }}>
                        <button onClick={() => toggleTask(task.id, true)}>
                          <Circle className="h-4 w-4 text-slate-300 dark:text-zinc-600 hover:text-green-500 transition-colors" />
                        </button>
                        <span className="flex-1 text-sm">{task.name}</span>
                        {task.url && (
                          <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors shrink-0" title={task.url}>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
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

      {/* ── Coming Up ── */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h2 className={`font-bold text-sm ${headingCls} flex items-center gap-1.5`}>
            <CalendarClock className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
            Coming Up
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {upcoming.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-2 pl-3 text-slate-500 dark:text-zinc-400" style={{ borderLeft: `6px solid ${SPRINT_COLORS[task.sprint]}` }}>
                <span className="w-20 text-xs font-medium text-slate-400 dark:text-zinc-500 shrink-0">
                  {formatRelativeDate(task.scheduledDate)}
                </span>
                <span className="flex-1 text-sm">{task.name}</span>
                {task.url && (
                  <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-1 inline-flex items-center text-zinc-400 hover:text-blue-500 transition-colors shrink-0" title={task.url}>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
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
