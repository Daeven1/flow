"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LENGTH,
  LENGTHS,
  defaultRule,
  type FocusRule,
  type PlannedMinutes,
} from "@/lib/focus/session";

type Props = {
  taskIds: string[];
  onStart: (input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[] }) => void;
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

const RULE_TEXT: Record<FocusRule, string> = {
  STRICT:
    "If you leave Grove for more than 10 seconds, this session is lost. Keep your phone open and, ideally, plugged in.",
  GENTLE: "The session only ends early if you give up.",
};

function choiceClass(selected: boolean) {
  return `flex-1 min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${focusRing} ${
    selected
      ? "bg-slate-900 dark:bg-white text-white dark:text-zinc-900 border-slate-900 dark:border-white"
      : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800"
  }`;
}

export function SessionSetup({ taskIds, onStart }: Props) {
  const [length, setLength] = useState<PlannedMinutes>(DEFAULT_LENGTH);
  const [rule, setRule] = useState<FocusRule>("GENTLE");

  // Reads the device, so it runs after mount rather than during render.
  useEffect(() => {
    setRule(
      defaultRule({
        coarsePointer: window.matchMedia("(pointer: coarse)").matches,
        width: window.innerWidth,
      }),
    );
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
          How long
        </div>
        <div className="flex gap-2">
          {LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={length === m}
              onClick={() => setLength(m)}
              className={choiceClass(length === m)}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
          Focus rule
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={rule === "STRICT"}
            onClick={() => setRule("STRICT")}
            className={choiceClass(rule === "STRICT")}
          >
            Strict
          </button>
          <button
            type="button"
            aria-pressed={rule === "GENTLE"}
            onClick={() => setRule("GENTLE")}
            className={choiceClass(rule === "GENTLE")}
          >
            Gentle
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2">{RULE_TEXT[rule]}</p>
      </div>

      <button
        type="button"
        onClick={() => onStart({ plannedMinutes: length, rule, taskIds })}
        disabled={taskIds.length === 0}
        className={`w-full min-h-[44px] py-2.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`}
      >
        Start focusing
      </button>
    </div>
  );
}
