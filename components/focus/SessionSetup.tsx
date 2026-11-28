"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Play, Sprout } from "lucide-react";
import {
  LENGTHS,
  defaultRule,
  type FocusRule,
  type PlannedMinutes,
  type SavedPlant,
} from "@/lib/focus/session";
import type { SetupOptions } from "@/lib/focus/setupDraft";
import {
  COST,
  SPECIES,
  canTend,
  defaultSpot,
  freeSpots,
  gridSize,
  type GrovePlant,
  type Species,
} from "@/lib/grove/layout";
import type { GroveStatus } from "@/lib/grove/useGrove";
import { Grove } from "@/components/grove/Grove";
import { plantCount, seedCount, speciesButtonName } from "@/components/focus/groveText";

type Props = {
  taskIds: string[];
  options: SetupOptions;
  onOptionsChange: (options: Partial<SetupOptions>) => void;
  plants: GrovePlant[];
  seeds: number | null; // from the last good grove load; null until one carries a balance
  groveStatus: GroveStatus;
  onStart: (input: { plannedMinutes: PlannedMinutes; rule: FocusRule; taskIds: string[]; plant: SavedPlant | null }) => void;
};

type Choice = SetupOptions["choice"];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

const RULE_TEXT: Record<FocusRule, string> = {
  STRICT:
    "Keep Grove on screen. Switching apps or locking your screen for more than 10 seconds ends the session.",
  GENTLE: "You can switch tabs or lock your screen. The timer keeps going.",
};

function choiceClass(selected: boolean) {
  return `flex-1 min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${focusRing} ${
    selected
      ? "bg-emerald-800 dark:bg-emerald-200 text-white dark:text-emerald-950 border-emerald-800 dark:border-emerald-200"
      : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800"
  }`;
}

/** A "What to grow" button, with its name over a cost line. */
function growClass(selected: boolean, unaffordable: boolean) {
  const look = selected
    ? "bg-emerald-800 dark:bg-emerald-200 text-white dark:text-emerald-950 border-emerald-800 dark:border-emerald-200"
    : unaffordable
      ? "bg-slate-50 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 border-dashed border-slate-300 dark:border-zinc-700 cursor-not-allowed"
      : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800";
  return `min-h-[44px] px-3 py-1.5 flex flex-col items-center justify-center text-sm font-medium rounded-lg border transition-colors ${focusRing} ${look}`;
}

function costClass(selected: boolean) {
  return `text-xs font-normal ${selected ? "text-emerald-100 dark:text-emerald-800" : "text-slate-600 dark:text-zinc-400"}`;
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

export function SessionSetup({ taskIds, options, onOptionsChange, plants, seeds, groveStatus, onStart }: Props) {
  const { length, choice, spot: picked, treeId: pickedTree, customizingPlant } = options;
  const [now, setNow] = useState(() => Date.now());
  const [deviceRule] = useState(() => defaultRule({
    coarsePointer: typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
  }));
  const rule = options.rule ?? deviceRule;

  // The grid the new plant goes into. The picked spot while it is still free
  // (the grove may reload), otherwise the default.
  const n = gridSize(plants.length + 1);
  const availableSpots = useMemo(() => freeSpots(n, plants), [n, plants]);
  const spot = useMemo(() => {
    if (picked && availableSpots.some((s) => s.x === picked.x && s.y === picked.y)) return picked;
    return defaultSpot(n, plants);
  }, [picked, availableSpots, n, plants]);

  // A session can always start. Still loading: plant on the default spot of an
  // empty grove (the server moves a taken spot to the nearest free one).
  // Only a grove that failed to load plants nothing.
  const loadingSpot = defaultSpot(gridSize(1), []);

  // Paid plants need a known balance that covers them. While the balance is
  // unknown they stay unavailable and their cost line reads "Checking your seeds…".
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
  const checkingChoice = groveStatus === "loading" && (choice === "TEND" || COST[choice] > 0 || picked !== null);
  const plant: SavedPlant | null =
    groveStatus === "failed"
      ? null
      : tending && tree
        ? { species: "TREE", x: tree.x, y: tree.y, tendId: tree.id, stage: tree.stage + 1 }
        : groveStatus === "loading"
          ? loadingSpot && { species, x: loadingSpot.x, y: loadingSpot.y }
          : spot && { species, x: spot.x, y: spot.y };

  useEffect(() => {
    let timer: number;
    function refreshTime() {
      const time = Date.now();
      setNow(time);
      window.clearTimeout(timer);
      timer = window.setTimeout(refreshTime, 60_000 - time % 60_000);
    }
    refreshTime();
    document.addEventListener("visibilitychange", refreshTime);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshTime);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span id="focus-length-label" className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Session length</span>
          <span className="text-xs tabular-nums text-slate-600 dark:text-zinc-400">
            Ends at {new Date(now + length * 60_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <div role="group" aria-labelledby="focus-length-label" className="flex gap-2">
          {LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={length === m}
              onClick={() => onOptionsChange({ length: m })}
              className={choiceClass(length === m)}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div>
        <div id="focus-rule-label" className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-2">
          If you step away
        </div>
        <div role="group" aria-labelledby="focus-rule-label" aria-describedby="focus-rule-desc" className="flex gap-2">
          <button
            type="button"
            aria-pressed={rule === "STRICT"}
            onClick={() => onOptionsChange({ rule: "STRICT" })}
            className={choiceClass(rule === "STRICT")}
          >
            Strict
          </button>
          <button
            type="button"
            aria-pressed={rule === "GENTLE"}
            onClick={() => onOptionsChange({ rule: "GENTLE" })}
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
        <div className="border-y border-slate-200 dark:border-zinc-700">
          <button type="button" aria-expanded={customizingPlant} aria-controls="focus-plant-options"
            onClick={() => onOptionsChange({ customizingPlant: !customizingPlant })}
            className={`flex min-h-[52px] w-full items-center gap-3 rounded-md px-1 py-2 text-left ${focusRing}`}>
            <Sprout aria-hidden="true" size={20} className="shrink-0 text-emerald-700 dark:text-emerald-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-slate-600 dark:text-zinc-400">What to grow</span>
              <span className="text-sm font-semibold">{checkingChoice ? "Checking your planting choice…" : tending ? "Tend a tree" : speciesButtonName(species)}</span>
            </span>
            {!checkingChoice && <span className="text-xs text-slate-600 dark:text-zinc-400">{tending || COST[species] === 0 ? "Free" : seedCount(COST[species])}</span>}
            <ChevronDown aria-hidden="true" size={16} className={customizingPlant ? "rotate-180" : ""} />
          </button>
          <div id="focus-plant-options" hidden={!customizingPlant}>
          {customizingPlant && <div className="pb-4 pt-2">
              <div id="focus-plant-label" className="mb-2 text-sm font-medium">
                {seeds === null ? "Choose a plant" : `Your balance · ${seedCount(seeds)}`}
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
                        if (!blocked) onOptionsChange({ choice: sp });
                      }}
                      className={growClass(on, blocked)}
                    >
                      <span>{speciesButtonName(sp)}</span>{" "}
                      <span className={costClass(on)}>
                        {COST[sp] === 0
                          ? "Free"
                          : short === null
                            ? "Checking your seeds…"
                            : short > 0
                              ? `Needs ${short} more`
                              : seedCount(COST[sp])}
                      </span>
                    </button>
                  );
                })}
                {trees.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={tending}
                    onClick={() => onOptionsChange({ choice: "TEND" })}
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
                onPickSpot={spot => onOptionsChange({ spot })}
                tendable={tending}
                selectedTreeId={tending && tree ? tree.id : null}
                onPickTree={(id) => {
                  if (trees.some((t) => t.id === id)) onOptionsChange({ treeId: id });
                }}
                label={
                  groveStatus !== "loaded"
                    ? "Loading your grove"
                    : tending
                      ? `Choose a tree to tend. Your grove: ${plantCount(plants.length)}`
                      : `Choose where to plant. Your grove: ${plantCount(plants.length)}`
                }
                className="mt-3 h-48 w-full sm:h-60"
                fallback={null}
              />
              {groveStatus === "loaded" && plant && (
                <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                  {tending ? "Tree to tend" : "Planting spot"}
                  <select
                    value={tending ? tree?.id : `${plant.x},${plant.y}`}
                    onChange={(event) => {
                      if (tending) onOptionsChange({ treeId: event.target.value });
                      else onOptionsChange({ spot: availableSpots.find((s) => `${s.x},${s.y}` === event.target.value) ?? null });
                    }}
                    className={`min-h-[44px] rounded-md border border-slate-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900 ${focusRing}`}
                  >
                    {(tending ? trees : availableSpots).map((s) => {
                      const value = "id" in s ? String(s.id) : `${s.x},${s.y}`;
                      return <option key={value} value={value}>Row {s.y + n / 2 + 1}, column {s.x + n / 2 + 1}</option>;
                    })}
                  </select>
                </label>
              )}
          </div>}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onStart({ plannedMinutes: length, rule, taskIds, plant })}
        disabled={taskIds.length === 0 || checkingChoice}
        className={`inline-flex w-full items-center justify-center gap-2 min-h-[48px] py-2.5 bg-emerald-800 dark:bg-emerald-200 text-white dark:text-emerald-950 text-sm font-semibold rounded-lg hover:bg-emerald-900 dark:hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`}
      >
        <Play size={15} aria-hidden="true" /> Start {length}-minute session
      </button>
      {checkingChoice && taskIds.length > 0 && (
        <button type="button" onClick={() => onStart({ plannedMinutes: length, rule, taskIds, plant: null })}
          className={`min-h-11 w-full rounded-lg text-sm font-medium underline underline-offset-4 ${focusRing}`}>
          Start without planting
        </button>
      )}
    </div>
  );
}
