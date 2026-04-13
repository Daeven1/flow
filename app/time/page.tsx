"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SprintBadge } from "@/components/SprintBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPRINT_COLORS, formatMinutes } from "@/lib/utils";
import { Clock, Plus } from "lucide-react";

interface Task {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  actualMinutes: number | null;
  done: boolean;
}

interface TimeLog {
  id: string;
  taskName: string;
  sprint: number;
  estMinutes: number;
  actualMinutes: number;
  date: string;
}

export default function TimePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [, setLogs] = useState<TimeLog[]>([]);
  const [selectedTask, setSelectedTask] = useState("");
  const [actualMinutes, setActualMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [tasksRes] = await Promise.all([fetch("/api/tasks")]);
    const tasksData: Task[] = await tasksRes.json();
    setTasks(tasksData);

    setLogs([]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logTime() {
    const task = tasks.find((t) => t.id === selectedTask);
    if (!task || !actualMinutes) return;
    setSaving(true);
    await fetch("/api/timelogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        taskName: task.name,
        sprint: task.sprint,
        estMinutes: task.estMinutes,
        actualMinutes: parseInt(actualMinutes),
      }),
    });
    setActualMinutes("");
    setSaving(false);
    load();
  }

  const selectedTaskObj = tasks.find((t) => t.id === selectedTask);

  // Accuracy by sprint (based on tasks with actual data)
  const sprintStats = [1, 2, 3, 4].map((s) => {
    const ts = tasks.filter((t) => t.sprint === s && t.actualMinutes != null);
    const totalEst = ts.reduce((sum, t) => sum + t.estMinutes, 0);
    const totalActual = ts.reduce((sum, t) => sum + (t.actualMinutes ?? 0), 0);
    const accuracy =
      totalEst > 0 ? Math.round((totalActual / totalEst) * 100) : null;
    return { sprint: s, totalEst, totalActual, accuracy, count: ts.length };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Time Logging</h1>
        <div className="text-xs text-zinc-400 flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          Advanced mode
        </div>
      </div>

      {/* Log time form */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
        <h2 className="font-medium text-sm">Log actual time</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs text-slate-500 dark:text-zinc-400">Task</label>
            <Select value={selectedTask} onValueChange={setSelectedTask}>
              <SelectTrigger>
                <SelectValue placeholder="Select a task…" />
              </SelectTrigger>
              <SelectContent>
                {tasks
                  .filter((t) => !t.done)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500 dark:text-zinc-400">
              Actual time (mins)
              {selectedTaskObj && (
                <span className="ml-1 text-zinc-400">
                  est. {selectedTaskObj.estMinutes}m
                </span>
              )}
            </label>
            <Input
              type="number"
              min="1"
              placeholder="e.g. 45"
              value={actualMinutes}
              onChange={(e) => setActualMinutes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={logTime}
            disabled={saving || !selectedTask || !actualMinutes}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Log time
          </Button>
        </div>
      </div>

      {/* Task table with est vs actual */}
      <div>
        <h2 className="font-medium text-sm mb-3">Estimated vs Actual</h2>
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800">
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Task</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">Sprint</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Est.</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Actual</th>
                <th className="text-right px-4 py-2.5 text-xs text-zinc-500 font-medium">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {tasks.filter((t) => t.actualMinutes != null).length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-zinc-400 text-xs"
                  >
                    No time logged yet. Log actual time above.
                  </td>
                </tr>
              ) : (
                tasks
                  .filter((t) => t.actualMinutes != null)
                  .map((task) => {
                    const diff = (task.actualMinutes ?? 0) - task.estMinutes;
                    return (
                      <tr key={task.id}>
                        <td className="px-4 py-2.5">{task.name}</td>
                        <td className="px-4 py-2.5">
                          <SprintBadge sprint={task.sprint} size="sm" />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMinutes(task.estMinutes)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMinutes(task.actualMinutes ?? 0)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right tabular-nums text-xs ${
                            diff > 0
                              ? "text-red-500"
                              : diff < 0
                              ? "text-green-500"
                              : "text-zinc-400"
                          }`}
                        >
                          {diff > 0 ? `+${formatMinutes(diff)}` : diff < 0 ? `-${formatMinutes(Math.abs(diff))}` : "—"}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sprint accuracy bars */}
      <div>
        <h2 className="font-medium text-sm mb-3">Sprint accuracy</h2>
        <div className="space-y-3">
          {sprintStats.map(({ sprint, totalEst, totalActual, accuracy, count }) => {
            const color = SPRINT_COLORS[sprint];
            const pct = totalEst > 0 ? Math.min((totalActual / totalEst) * 100, 200) : 0;
            return (
              <div key={sprint} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <SprintBadge sprint={sprint} size="sm" />
                  <span className="text-zinc-400">
                    {count > 0
                      ? `${formatMinutes(totalActual)} actual / ${formatMinutes(totalEst)} est (${accuracy}%)`
                      : "No data yet"}
                  </span>
                </div>
                <div className="relative h-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                  {/* Est baseline at 100% */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-zinc-300 dark:bg-zinc-600"
                    style={{ left: "50%" }}
                  />
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${pct / 2}%`,
                      backgroundColor: color,
                      opacity: count === 0 ? 0.3 : 0.8,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
