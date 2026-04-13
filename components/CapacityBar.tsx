import { SPRINT_CAPACITY, SPRINT_COLORS, formatMinutes } from "@/lib/utils";

interface CapacityBarProps {
  sprint: number;
  totalMinutes: number;
}

export function CapacityBar({ sprint, totalMinutes }: CapacityBarProps) {
  const color = SPRINT_COLORS[sprint] ?? "#888";
  const pct = Math.min((totalMinutes / SPRINT_CAPACITY) * 100, 100);
  const over = totalMinutes > SPRINT_CAPACITY;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 dark:bg-zinc-800 rounded overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? "#E24B4A" : color,
          }}
        />
      </div>
      <span className={`text-xs tabular-nums w-20 text-right ${over ? "text-red-500" : "text-zinc-500"}`}>
        {formatMinutes(totalMinutes)} / {formatMinutes(SPRINT_CAPACITY)}
      </span>
    </div>
  );
}
