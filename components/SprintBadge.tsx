import { SPRINT_LABELS } from "@/lib/utils";

interface SprintBadgeProps {
  sprint: number;
  size?: "sm" | "md";
}

export function SprintBadge({ sprint, size = "md" }: SprintBadgeProps) {
  const label = SPRINT_LABELS[sprint] ?? `S${sprint}`;
  const classMap: Record<number, string> = {
    1: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900",
    2: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900",
    3: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900",
    4: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900",
  };
  const cls = classMap[sprint] ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400";
  return (
    <span
      className={`inline-flex items-center rounded font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs"
      } ${cls}`}
    >
      {label}
    </span>
  );
}
