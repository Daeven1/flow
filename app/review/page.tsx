"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SprintBadge } from "@/components/SprintBadge";
import { SPRINT_COLORS, SPRINT_LABELS, formatMinutes } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, TrendingUp, Clock, Save } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format, startOfWeek } from "date-fns";

interface ReviewData {
  doneTasks: number;
  totalEstMinutes: number;
  totalActualMinutes: number;
  sprintBreakdown: {
    sprint: number;
    actual: number;
    est: number;
    count: number;
  }[];
  urgentPct: number;
  nudge: string | null;
  dailyLogs: {
    id: string;
    date: string;
    highlight: string;
    highlightDone: boolean;
    microCommitment: string;
    microDone: boolean;
  }[];
  weeklyLog: {
    highlightsDone: number;
    microsDone: number;
  } | null;
}

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const load = useCallback(async () => {
    const res = await fetch("/api/review?weeks=1");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveWeekly() {
    setSaving(true);
    await fetch("/api/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart: weekStart.toISOString(),
        highlightsDone: data?.dailyLogs.filter((l) => l.highlightDone).length ?? 0,
        microsDone: data?.dailyLogs.filter((l) => l.microDone).length ?? 0,
        notes,
      }),
    });
    setSaving(false);
    alert("Weekly review saved!");
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-400 text-sm">
        Loading…
      </div>
    );
  }

  const chartData = data.sprintBreakdown.map((s) => ({
    name: `S${s.sprint}`,
    label: SPRINT_LABELS[s.sprint],
    actual: s.actual,
    est: s.est,
  }));

  const highlightsDone = data.dailyLogs.filter((l) => l.highlightDone).length;
  const microsDone = data.dailyLogs.filter((l) => l.microDone).length;
  const totalHighlights = data.dailyLogs.filter((l) => l.highlight).length;
  const totalMicros = data.dailyLogs.filter((l) => l.microCommitment).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Weekly Review</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Reflect on the week — what you completed, time spent, and patterns across sprints.</p>
        </div>
        <span className="text-sm text-zinc-400">
          Week of {format(weekStart, "d MMM yyyy")}
        </span>
      </div>

      {/* Nudge banner */}
      {data.nudge && (
        <div className="flex items-start gap-3 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">{data.nudge}</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Tasks done",
            value: data.doneTasks,
            icon: CheckCircle2,
            color: "text-green-500",
          },
          {
            label: "Est. time",
            value: formatMinutes(data.totalEstMinutes),
            icon: Clock,
            color: "text-zinc-400",
          },
          {
            label: "Highlights hit",
            value: `${highlightsDone}/${totalHighlights}`,
            icon: TrendingUp,
            color: "text-blue-500",
          },
          {
            label: "Micro-commits done",
            value: `${microsDone}/${totalMicros}`,
            icon: CheckCircle2,
            color: "text-purple-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded border border-slate-200 dark:border-zinc-800 p-3"
          >
            <div className="text-xs text-zinc-500 mb-1">{label}</div>
            <div className={`text-lg font-semibold flex items-center gap-1 ${color}`}>
              <Icon className="h-4 w-4" />
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Sprint time breakdown chart */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4">
        <h2 className="font-medium text-sm mb-4">Time by Sprint</h2>
        {data.totalActualMinutes === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-4">
            No time logged this week. Use the Time page to track actual minutes.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${Math.round(v / 60)}h`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value) => formatMinutes(Number(value))}
                contentStyle={{
                  fontSize: 12,
                  border: "1px solid #e4e4e7",
                  borderRadius: 4,
                }}
              />
              <Bar dataKey="actual" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={SPRINT_COLORS[index + 1] ?? "#888"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Sprint accuracy table */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-zinc-800">
              <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Sprint</th>
              <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Tasks</th>
              <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Est.</th>
              <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Actual</th>
              <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">% of total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.sprintBreakdown.map((s) => {
              const pct =
                data.totalActualMinutes > 0
                  ? Math.round((s.actual / data.totalActualMinutes) * 100)
                  : 0;
              return (
                <tr key={s.sprint}>
                  <td className="px-4 py-2.5">
                    <SprintBadge sprint={s.sprint} size="sm" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{s.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-zinc-400">
                    {s.est > 0 ? formatMinutes(s.est) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {s.actual > 0 ? formatMinutes(s.actual) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {pct > 0 ? (
                      <span
                        className={`text-xs font-medium ${
                          s.sprint === 1 && pct > 60 ? "text-red-500" : "text-zinc-500"
                        }`}
                      >
                        {pct}%
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Weekly log form */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 space-y-4">
        <h2 className="font-medium text-sm">Weekly Log</h2>

        <div>
          <label className="text-xs text-zinc-500 block mb-1.5">
            Reflection notes (optional)
          </label>
          <Textarea
            rows={4}
            placeholder="What went well? What was hard? What will you change next week?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Daily highlight summary */}
        {data.dailyLogs.length > 0 && (
          <div>
            <h3 className="text-xs text-zinc-500 mb-2">This week&apos;s highlights</h3>
            <div className="space-y-1">
              {data.dailyLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-sm">
                  {log.highlightDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-zinc-300 flex-shrink-0" />
                  )}
                  <span className="text-xs text-zinc-400 w-20 flex-shrink-0">
                    {format(new Date(log.date), "EEE d MMM")}
                  </span>
                  <span className={log.highlightDone ? "line-through text-zinc-400" : ""}>
                    {log.highlight || <span className="text-zinc-300 italic">No highlight set</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button size="sm" onClick={saveWeekly} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save weekly review
        </Button>
      </div>
    </div>
  );
}
