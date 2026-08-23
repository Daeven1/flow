"use client";

import { useEffect, useRef, useState } from "react";
import {
  DragDropContext,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarDayColumn, CalendarTaskCard, type CalendarTask } from "@/components/CalendarDayColumn";

const WINDOW_DAYS = 14;

interface TasksCalendarProps {
  tasks: CalendarTask[];
  workNightDays: number[];
  onReload: () => void | Promise<void>;
}

function sortForColumn(list: CalendarTask[]) {
  return [...list].sort((a, b) => {
    if (a.sprint !== b.sprint) return a.sprint - b.sprint;
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
  });
}

export function TasksCalendar({ tasks, workNightDays, onReload }: TasksCalendarProps) {
  const [local, setLocal] = useState<CalendarTask[]>(tasks);
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()));
  const pendingRefcount = useRef<Map<string, number>>(new Map());
  const dragSequence = useRef<Map<string, number>>(new Map());

  // Keep the optimistic copy in step with fresh server data, preserving pending optimistic updates
  useEffect(() => {
    setLocal((prev) => {
      const merged = [...tasks];
      for (const [pendingId, refcount] of pendingRefcount.current) {
        if (refcount > 0) {
          const pendingTask = prev.find((t) => t.id === pendingId);
          if (pendingTask) {
            const idx = merged.findIndex((t) => t.id === pendingId);
            if (idx !== -1) {
              // Carry forward only scheduledDate from optimistic state; take other fields from server
              merged[idx] = { ...merged[idx], scheduledDate: pendingTask.scheduledDate };
            }
          }
        }
      }
      return merged;
    });
  }, [tasks]);

  const today = startOfDay(new Date());
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i));
  const unscheduled = sortForColumn(local.filter((t) => !t.scheduledDate));

  function tasksForDay(dateKey: string) {
    return sortForColumn(
      local.filter(
        (t) => t.scheduledDate && t.scheduledDate.slice(0, 10) === dateKey
      )
    );
  }

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const toTray = destination.droppableId === "tray";
    const nextDate = toTray ? null : destination.droppableId.slice("day:".length);

    // Capture the previous scheduledDate and sequence number for rollback
    const previousDate = local.find((t) => t.id === draggableId)?.scheduledDate ?? null;
    const currentSequence = (dragSequence.current.get(draggableId) ?? 0) + 1;
    dragSequence.current.set(draggableId, currentSequence);

    // Optimistically update UI
    setLocal((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, scheduledDate: nextDate } : t))
    );

    // Increment refcount for this task
    const refcount = (pendingRefcount.current.get(draggableId) ?? 0) + 1;
    pendingRefcount.current.set(draggableId, refcount);

    try {
      let saved = false;
      try {
        const res = await fetch(`/api/tasks/${draggableId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledDate: nextDate, schedulePinned: !toTray }),
        });
        saved = res.ok;
        if (!saved) {
          console.error(
            `Failed to reschedule task ${draggableId}: server responded with ${res.status}`
          );
        }
      } catch (err) {
        console.error(`Failed to reschedule task ${draggableId}:`, err);
      }

      if (!saved) {
        // Only rollback if this is still the latest sequence for this task
        if (dragSequence.current.get(draggableId) === currentSequence) {
          setLocal((prev) =>
            prev.map((t) =>
              t.id === draggableId ? { ...t, scheduledDate: previousDate } : t
            )
          );
        }
        return;
      }

      // Saved. Refresh page state, but never roll back a persisted change.
      try {
        await onReload();
      } catch (err) {
        console.error("Rescheduled, but refreshing the task list failed:", err);
      }
    } finally {
      // Decrement refcount; delete if it hits zero
      const newRefcount = (pendingRefcount.current.get(draggableId) ?? 1) - 1;
      if (newRefcount <= 0) {
        pendingRefcount.current.delete(draggableId);
      } else {
        pendingRefcount.current.set(draggableId, newRefcount);
      }
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWindowStart((d) => addDays(d, -WINDOW_DAYS))}
            className="rounded-md border border-slate-200 dark:border-zinc-800 p-1 hover:bg-slate-50 dark:hover:bg-zinc-800"
            aria-label="Previous fortnight"
          >
            <ChevronLeft className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
          </button>
          <button
            type="button"
            onClick={() => setWindowStart(startOfDay(new Date()))}
            className="rounded-md border border-slate-200 dark:border-zinc-800 px-2 py-1 text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWindowStart((d) => addDays(d, WINDOW_DAYS))}
            className="rounded-md border border-slate-200 dark:border-zinc-800 p-1 hover:bg-slate-50 dark:hover:bg-zinc-800"
            aria-label="Next fortnight"
          >
            <ChevronRight className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
          </button>
          <span className="text-xs text-slate-500 dark:text-zinc-400 ml-1">
            {format(days[0], "d MMM")} — {format(days[days.length - 1], "d MMM yyyy")}
          </span>
        </div>

        <div className="flex gap-3 items-start">
          {/* Unscheduled tray */}
          <div className="sticky top-4 self-start shrink-0 w-52 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <div className="px-2.5 py-2 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-200">
                Unscheduled
              </span>
              <span className="ml-1.5 text-[10px] tabular-nums text-slate-400 dark:text-zinc-500">
                {unscheduled.length}
              </span>
            </div>
            <Droppable droppableId="tray">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`p-1.5 space-y-1.5 min-h-[10rem] max-h-[32rem] overflow-y-auto rounded-b-lg transition-colors ${
                    snapshot.isDraggingOver ? "bg-purple-50 dark:bg-purple-950/40" : ""
                  }`}
                >
                  {unscheduled.length === 0 && !snapshot.isDraggingOver && (
                    <p className="px-1 py-2 text-xs italic text-slate-400 dark:text-zinc-500">
                      Everything has a day. Drag a task here to unschedule it.
                    </p>
                  )}
                  {unscheduled.map((task, index) => (
                    <CalendarTaskCard key={task.id} task={task} index={index} />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Day columns */}
          <div className="flex-1 overflow-x-auto pb-2">
            <div className="flex gap-2">
              {days.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const weekday = day.getDay();
                return (
                  <CalendarDayColumn
                    key={dateKey}
                    date={day}
                    dateKey={dateKey}
                    tasks={tasksForDay(dateKey)}
                    isToday={dateKey === format(today, "yyyy-MM-dd")}
                    isWeekend={weekday === 0 || weekday === 6}
                    isWorkNight={workNightDays.includes(weekday)}
                    isPast={day < today}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}
