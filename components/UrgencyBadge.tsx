import { getUrgencyLabel, type UrgencyLabel } from "@/lib/utils";

const URGENCY_STYLES: Record<UrgencyLabel, string> = {
  "Past due": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Due today": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Due tomorrow": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Start soon": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "On track": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "No date": "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

interface UrgencyBadgeProps {
  dueDate?: Date | string | null;
}

export function UrgencyBadge({ dueDate }: UrgencyBadgeProps) {
  const label = getUrgencyLabel(dueDate);
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${URGENCY_STYLES[label]}`}>
      {label}
    </span>
  );
}
