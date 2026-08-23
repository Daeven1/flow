"use client";

import { Droppable, Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { Moon } from "lucide-react";
import { SprintBadge } from "@/components/SprintBadge";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { formatMinutes } from "@/lib/utils";

export interface CalendarTask {
  id: string;
  name: string;
  sprint: number;
  estMinutes: number;
  deadline: string | null;
  scheduledDate: string | null;
  workCategory: string;
  project: { id: string; name: string } | null;
}

interface CalendarDayColumnProps {
  date: Date;
  dateKey: string;
  tasks: CalendarTask[];
  isToday: boolean;
  isWeekend: boolean;
  isWorkNight: boolean;
  isPast: boolean;
}

interface CalendarTaskCardProps {
  task: CalendarTask;
  index: number;
}

export function CalendarTaskCard({ task, index }: CalendarTaskCardProps) {
  return (
    <Draggable key={task.id} draggableId={task.id} index={index}>
      {(dragProvided, dragSnapshot) => (
        <div
          ref={dragProvided.innerRef}
          {...dragProvided.draggableProps}
          {...dragProvided.dragHandleProps}
          className={`rounded-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 space-y-1 ${
            dragSnapshot.isDragging ? "shadow-lg" : ""
          }`}
        >
          <p className="text-xs leading-snug text-slate-700 dark:text-zinc-200">
            {task.name}
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            <SprintBadge sprint={task.sprint} size="sm" />
            {task.deadline && <UrgencyBadge dueDate={task.deadline} />}
          </div>
        </div>
      )}
    </Draggable>
  );
}

export function CalendarDayColumn({
  date,
  dateKey,
  tasks,
  isToday,
  isWeekend,
  isWorkNight,
  isPast,
}: CalendarDayColumnProps) {
  const totalMins = tasks.reduce((s, t) => s + t.estMinutes, 0);

  return (
    <div
      className={[
        "flex flex-col shrink-0 rounded-lg border",
        isWeekend
          ? "w-32 bg-slate-50/60 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800"
          : "w-48 bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800",
        isToday ? "ring-2 ring-purple-400" : "",
        isPast ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="px-2.5 py-2 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-xs font-medium ${
              isToday
                ? "text-purple-600 dark:text-purple-400"
                : isWeekend
                ? "text-slate-400 dark:text-zinc-500"
                : "text-slate-700 dark:text-zinc-200"
            }`}
          >
            {format(date, "EEE")}
          </span>
          <span
            className={`text-sm tabular-nums ${
              isToday
                ? "font-bold text-purple-600 dark:text-purple-400"
                : "text-slate-500 dark:text-zinc-400"
            }`}
          >
            {format(date, "d")}
          </span>
          {isWorkNight && (
            <Moon className="h-3 w-3 text-indigo-400 shrink-0" aria-label="Work night" />
          )}
          {totalMins > 0 && (
            <span className="ml-auto text-[10px] tabular-nums text-slate-400 dark:text-zinc-500">
              {formatMinutes(totalMins)}
            </span>
          )}
        </div>
      </div>

      <Droppable droppableId={`day:${dateKey}`}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[7rem] p-1.5 space-y-1.5 rounded-b-lg transition-colors ${
              snapshot.isDraggingOver ? "bg-purple-50 dark:bg-purple-950/40" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <CalendarTaskCard key={task.id} task={task} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
