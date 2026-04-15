"use client";

import Link from "next/link";
import { FolderOpen, CalendarClock, ArrowRight } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";

interface Task { done: boolean }

interface Project {
  id: string;
  name: string;
  deadline: string | null;
  tasks: Task[];
}

export function ProjectRow({ project }: { project: Project }) {
  const total = project.tasks.length;
  const done = project.tasks.filter((t) => t.done).length;

  return (
    <Link
      href="/projects"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
    >
      <FolderOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
      <span className="flex-1 text-sm font-medium">{project.name}</span>
      {total > 0 && (
        <span className="text-xs text-zinc-400 tabular-nums shrink-0">{done}/{total} steps</span>
      )}
      {project.deadline && (
        <span className="flex items-center gap-1 text-xs text-zinc-400 shrink-0">
          <CalendarClock className="h-3 w-3" />
          {formatRelativeDate(project.deadline)}
        </span>
      )}
      <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
    </Link>
  );
}
