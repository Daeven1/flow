"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LENGTH,
  LENGTHS,
  defaultRule,
  type FocusRule,
  type PlannedMinutes,
} from "@/lib/focus/session";
import {
  COST,
  SPECIES,
  defaultSpot,
  freeSpots,
  gridSize,
  type GrovePlant,
  type PlantChoice,
  type Species,
  type Spot,
} from "@/lib/grove/layout";
import type { GroveStatus } from "@/lib/grove/useGrove";
import { Grove } from "@/components/grove/Grove";
import { OnFallback, plantCount, speciesName } from "@/components/focus/groveText";

type Props = {
  taskIds: string[];
  plants: GrovePlant[];
  groveStatus: GroveStatus;
  onStart: (input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[]; plant: PlantChoice | null }) => void;
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

export function SessionSetup({ taskIds, plants, groveStatus, onStart }: Props) {
  const [length, setLength] = useState<PlannedMinutes>(DEFAULT_LENGTH);
  const [rule, setRule] = useState<FocusRule>("GENTLE");
  const [species, setSpecies] = useState<Species>("WILDFLOWERS");
  const [picked, setPicked] = useState<Spot | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const onNoWebGL = useCallback(() => setNoWebGL(true), []);

  // The grid the new plant goes into. The picked spot while it is still free
  // (the grove may reload), otherwise the default.
  const n = gridSize(plants.length + 1);
  const spot = useMemo(() => {
    if (picked && freeSpots(n, plants).some((s) => s.x === picked.x && s.y === picked.y)) return picked;
    return defaultSpot(n, plants);
  }, [picked, n, plants]);

  // A session can always start. Still loading: plant on the default spot of an
  // empty grove (the server moves a taken spot to the nearest free one).
  // Only a grove that failed to load plants nothing.
  const loadingSpot = defaultSpot(gridSize(1), []);
  const plant: PlantChoice | null =
    groveStatus === "failed"
      ? null
      : groveStatus === "loading"
        ? loadingSpot && { species, x: loadingSpot.x, y: loadingSpot.y }
        : spot && { species, x: spot.x, y: spot.y };

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
        <div id="focus-length-label" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
          How long
        </div>
        <div role="group" aria-labelledby="focus-length-label" className="flex gap-2">
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
        <div id="focus-rule-label" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
          Focus rule
        </div>
        <div role="group" aria-labelledby="focus-rule-label" aria-describedby="focus-rule-desc" className="flex gap-2">
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
        <p id="focus-rule-desc" className="text-sm text-slate-600 dark:text-zinc-400 mt-2">{RULE_TEXT[rule]}</p>
      </div>

      {groveStatus === "failed" ? (
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Your grove couldn&apos;t load, so this session won&apos;t plant anything. The timer works as usual.
        </p>
      ) : (
        <div>
          <div id="focus-plant-label" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
            What to grow
          </div>
          <div role="group" aria-labelledby="focus-plant-label" className="flex gap-2">
            {SPECIES.filter((sp) => COST[sp] === 0).map((sp) => (
              <button
                key={sp}
                type="button"
                aria-pressed={species === sp}
                onClick={() => setSpecies(sp)}
                className={choiceClass(species === sp)}
              >
                {speciesName(sp)}
              </button>
            ))}
          </div>
          <Grove
            plants={groveStatus === "loaded" ? plants : []}
            pickable={groveStatus === "loaded"}
            selectedSpot={groveStatus === "loaded" ? spot : null}
            onPickSpot={setPicked}
            label={
              groveStatus === "loaded"
                ? `Choose where to plant. Your grove: ${plantCount(plants.length)}`
                : "Loading your grove"
            }
            className="w-full h-[280px] mt-3"
            fallback={<OnFallback onShow={onNoWebGL} />}
          />
          {!noWebGL && (
            <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2">
              {groveStatus === "loaded" ? "A spot is picked for you. Tap another to move it." : "Loading your grove…"}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onStart({ plannedMinutes: length, rule, taskIds, plant })}
        disabled={taskIds.length === 0}
        className={`w-full min-h-[44px] py-2.5 bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold rounded-lg hover:bg-slate-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`}
      >
        Start focusing
      </button>
    </div>
  );
}
