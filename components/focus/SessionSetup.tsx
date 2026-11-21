"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LENGTH,
  LENGTHS,
  defaultRule,
  type FocusRule,
  type PlannedMinutes,
  type SavedPlant,
} from "@/lib/focus/session";
import {
  COST,
  SPECIES,
  canTend,
  defaultSpot,
  freeSpots,
  gridSize,
  type GrovePlant,
  type Species,
  type Spot,
} from "@/lib/grove/layout";
import type { GroveStatus } from "@/lib/grove/useGrove";
import { Grove } from "@/components/grove/Grove";
import { OnFallback, TEND_HINT, plantCount, seedCount, speciesButtonName } from "@/components/focus/groveText";

type Props = {
  taskIds: string[];
  plants: GrovePlant[];
  seeds: number | null; // from the last good grove load; null until one carries a balance
  groveStatus: GroveStatus;
  onStart: (input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[]; plant: SavedPlant | null }) => void;
};

type Choice = Species | "TEND";

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

/** A "What to grow" button, with its name over a cost line. */
function growClass(selected: boolean, unaffordable: boolean) {
  const look = selected
    ? "bg-slate-900 dark:bg-white text-white dark:text-zinc-900 border-slate-900 dark:border-white"
    : unaffordable
      ? "bg-slate-50 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 border-dashed border-slate-300 dark:border-zinc-700 cursor-not-allowed"
      : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800";
  return `min-h-[44px] px-3 py-1.5 flex flex-col items-center justify-center text-sm font-medium rounded-lg border transition-colors ${focusRing} ${look}`;
}

function costClass(selected: boolean) {
  return `text-xs font-normal ${selected ? "text-slate-300 dark:text-zinc-600" : "text-slate-600 dark:text-zinc-400"}`;
}

/** The tendable tree nearest the middle of the grove (ties: top row first, then left). */
function middleTree(trees: GrovePlant[]): GrovePlant | null {
  let best: GrovePlant | null = null;
  let bestD = Infinity;
  for (const t of trees) {
    const d = (t.x + 0.5) ** 2 + (t.y + 0.5) ** 2;
    if (best === null || d < bestD || (d === bestD && (t.y < best.y || (t.y === best.y && t.x < best.x)))) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

export function SessionSetup({ taskIds, plants, seeds, groveStatus, onStart }: Props) {
  const [length, setLength] = useState<PlannedMinutes>(DEFAULT_LENGTH);
  const [rule, setRule] = useState<FocusRule>("GENTLE");
  const [choice, setChoice] = useState<Choice>("WILDFLOWERS");
  const [picked, setPicked] = useState<Spot | null>(null);
  const [pickedTree, setPickedTree] = useState<string | null>(null);
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

  // Paid plants need a known balance that covers them. While the balance is
  // unknown they stay unavailable, but the cost line is not a "Needs" line.
  const shortBy = (sp: Species) => (seeds === null ? null : Math.max(0, COST[sp] - seeds));
  const affordable = (sp: Species) => COST[sp] === 0 || shortBy(sp) === 0;

  // Trees that can be tended: saved ones only (a plant still waiting to reach
  // the server has no id the server knows).
  const trees = useMemo(
    () => (groveStatus === "loaded" ? plants.filter((p) => canTend(p) && !p.id.startsWith("pending:")) : []),
    [groveStatus, plants],
  );
  const tree = useMemo(
    () => trees.find((t) => t.id === pickedTree) ?? middleTree(trees),
    [trees, pickedTree],
  );

  // What the session grows: the choice while it is still possible, otherwise wildflowers.
  const tending = choice === "TEND" && tree !== null;
  const species: Species = choice !== "TEND" && affordable(choice) ? choice : "WILDFLOWERS";
  const selected: Choice = tending ? "TEND" : species;
  const plant: SavedPlant | null =
    groveStatus === "failed"
      ? null
      : tending && tree
        ? { species: "TREE", x: tree.x, y: tree.y, tendId: tree.id, stage: tree.stage + 1 }
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
          <div role="group" aria-labelledby="focus-plant-label" className="grid grid-cols-2 gap-2">
            {SPECIES.map((sp) => {
              const on = selected === sp;
              const short = shortBy(sp);
              const blocked = !affordable(sp);
              return (
                <button
                  key={sp}
                  type="button"
                  aria-pressed={on}
                  aria-disabled={blocked || undefined}
                  onClick={() => {
                    if (!blocked) setChoice(sp);
                  }}
                  className={growClass(on, blocked)}
                >
                  <span>{speciesButtonName(sp)}</span>{" "}
                  <span className={costClass(on)}>
                    {COST[sp] === 0 ? "Free" : short !== null && short > 0 ? `Needs ${short} more` : seedCount(COST[sp])}
                  </span>
                </button>
              );
            })}
            {trees.length > 0 && (
              <button
                type="button"
                aria-pressed={tending}
                onClick={() => setChoice("TEND")}
                className={`col-span-2 ${growClass(tending, false)}`}
              >
                <span>Tend a tree</span>{" "}
                <span className={costClass(tending)}>Free</span>
              </button>
            )}
          </div>
          <Grove
            plants={groveStatus === "loaded" ? plants : []}
            pickable={groveStatus === "loaded" && !tending}
            selectedSpot={groveStatus === "loaded" && !tending ? spot : null}
            onPickSpot={setPicked}
            tendable={tending}
            selectedTreeId={tending && tree ? tree.id : null}
            onPickTree={(id) => {
              if (trees.some((t) => t.id === id)) setPickedTree(id);
            }}
            label={
              groveStatus !== "loaded"
                ? "Loading your grove"
                : tending
                  ? `Choose a tree to tend. Your grove: ${plantCount(plants.length)}`
                  : `Choose where to plant. Your grove: ${plantCount(plants.length)}`
            }
            className="w-full h-[280px] mt-3"
            fallback={<OnFallback onShow={onNoWebGL} />}
          />
          {!noWebGL && (
            <p className="text-sm text-slate-600 dark:text-zinc-400 mt-2">
              {groveStatus !== "loaded"
                ? "Loading your grove…"
                : tending
                  ? TEND_HINT
                  : "A spot is picked for you. Tap another to move it."}
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
