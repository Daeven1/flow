"use client";

import { useEffect, useMemo, useState } from "react";
import { Grove, type Growing } from "@/components/grove/Grove";
import { MAX_STAGE, SPECIES, isTree, canTend, defaultSpot, freeSpots, gridSize, type GrovePlant, type Species, type Spot } from "@/lib/grove/layout";
import { SPECIES_INFO } from "@/lib/grove/species";
import type { Outcome } from "@/lib/focus/session";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400";

function choiceClass(selected: boolean) {
  return `min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${focusRing} ${
    selected
      ? "bg-slate-900 dark:bg-white text-white dark:text-zinc-900 border-slate-900 dark:border-white"
      : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800"
  }`;
}

const labelClass = "text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2";

/**
 * Kept plants placed the way real planting fills the grove (each on the
 * default spot of the grid it was planted into), so widening the grid can be
 * checked against earlier plants staying put. Wildflowers and ferns
 * alternate; every fourth plant (from the third) is a tree, cycling through
 * stages 1, 2, 3; the fifth and twelfth are berry bushes. Every seventh plant
 * (from the sixth) is withered, and a withered tree is always a sapling;
 * the tenth is a withered sapling, so the default list shows one.
 */
function labPlants(count: number): GrovePlant[] {
  const out: GrovePlant[] = [];
  let trees = 0;
  for (let i = 0; i < count; i++) {
    const spot = defaultSpot(gridSize(i + 1), out)!;
    const witheredSapling = i === 9;
    const withered = i % 7 === 5 || witheredSapling;
    const species: Species =
      i % 4 === 2 || witheredSapling ? "TREE" : i === 4 || i === 11 ? "BERRY_BUSH" : i % 2 === 0 ? "WILDFLOWERS" : "FERN";
    const stage = isTree(species) ? (withered ? 1 : (trees % MAX_STAGE) + 1) : 1;
    if (isTree(species) && !withered) trees++; // withered saplings don't use up a stage
    out.push({
      id: `lab-${i}`,
      species,
      x: spot.x,
      y: spot.y,
      status: withered ? "WITHERED" : "ALIVE",
      plantedAt: "2026-11-01T08:00:00.000Z",
      witheredAt: withered ? "2026-11-01T08:30:00.000Z" : null,
      stage,
    });
  }
  return out;
}

const OUTCOMES: { label: string; value: Outcome | null }[] = [
  { label: "None", value: null },
  { label: "Completed", value: "COMPLETED" },
  { label: "Gave up", value: "GAVE_UP" },
  { label: "Left", value: "LEFT" },
];

export default function GroveLab() {
  const [count, setCount] = useState(12);
  const [growth, setGrowth] = useState(50);
  const [species, setSpecies] = useState<Species>("WILDFLOWERS");
  const [stage, setStage] = useState(1);
  // Tend: the growing plant is a tend of a lab tree (the chosen one, else the first that can be tended).
  const [tend, setTend] = useState(false);
  const [tendable, setTendable] = useState(false);
  const [pickedTree, setPickedTree] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showGrowing, setShowGrowing] = useState(true);
  const [pickable, setPickable] = useState(false);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [dark, setDark] = useState(false);
  // Bumped to remount the grove, as the Focus page does when the end screen replaces the session.
  const [mount, setMount] = useState(0);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggleDark = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };

  const plants = useMemo(() => labPlants(count), [count]);
  const n = gridSize(count + 1);
  // The picked spot if it is still free in this grid, otherwise the default.
  const spot = useMemo(() => {
    if (picked && freeSpots(n, plants).some((s) => s.x === picked.x && s.y === picked.y)) return picked;
    return defaultSpot(n, plants);
  }, [picked, n, plants]);

  const tendTree = useMemo(
    () => plants.find((p) => p.id === pickedTree && canTend(p)) ?? plants.find(canTend) ?? null,
    [plants, pickedTree],
  );

  const growing = useMemo<Growing | null>(() => {
    // While picking there is no session yet, so no growing plant: that also
    // keeps the selected-spot marker visible.
    if (!showGrowing || pickable || tendable) return null;
    if (tend) {
      if (!tendTree) return null;
      return {
        species: tendTree.species, spot: { x: tendTree.x, y: tendTree.y }, stage: tendTree.stage + 1,
        progress: growth / 100, outcome, tendId: tendTree.id,
      };
    }
    if (!spot) return null;
    return { species, spot, stage: isTree(species) ? stage : 1, progress: growth / 100, outcome };
  }, [showGrowing, pickable, tendable, tend, tendTree, spot, species, stage, growth, outcome]);

  const total = count + (growing && !growing.tendId ? 1 : 0);

  const label = `Grove lab: ${total} ${total === 1 ? "plant" : "plants"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Grove lab</h1>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Dev only. Drag or use the arrow keys to turn the grove.
        </p>
      </div>

      <Grove
        key={mount}
        plants={plants}
        growing={growing}
        pickable={pickable}
        selectedSpot={spot}
        onPickSpot={setPicked}
        tendable={tendable}
        selectedTreeId={tendTree?.id ?? null}
        onPickTree={setPickedTree}
        label={label}
        className="w-full h-[min(60vh,520px)]"
        fallback={
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 p-6 text-sm">
            WebGL is not available, so this is the fallback.
          </div>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lab-count" className={labelClass + " block"}>Kept plants: {count}</label>
          <input id="lab-count" type="range" min={0} max={70} value={count}
            onChange={(e) => setCount(Number(e.target.value))} className={`w-full ${focusRing}`} />
        </div>
        <div>
          <label htmlFor="lab-growth" className={labelClass + " block"}>Growth: {growth} %</label>
          <input id="lab-growth" type="range" min={0} max={100} value={growth}
            onChange={(e) => setGrowth(Number(e.target.value))} className={`w-full ${focusRing}`} />
        </div>

        <div>
          <div id="lab-species" className={labelClass}>Species</div>
          <div role="group" aria-labelledby="lab-species" className="flex flex-wrap gap-2">
            {SPECIES.map((s) => (
              <button key={s} type="button" aria-pressed={species === s} onClick={() => setSpecies(s)} className={choiceClass(species === s)}>
                {SPECIES_INFO[s].name}
              </button>
            ))}
          </div>
          {isTree(species) && (
            <>
              <div id="lab-stage" className={labelClass + " mt-3"}>Tree stage (grows into)</div>
              <div role="group" aria-labelledby="lab-stage" className="flex gap-2">
                {[1, 2, 3].map((s) => (
                  <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)} className={choiceClass(stage === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div>
          <div id="lab-outcome" className={labelClass}>Outcome</div>
          <div role="group" aria-labelledby="lab-outcome" className="flex flex-wrap gap-2">
            {OUTCOMES.map((o) => (
              <button key={o.label} type="button" aria-pressed={outcome === o.value} onClick={() => setOutcome(o.value)} className={choiceClass(outcome === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="button" aria-pressed={showGrowing} onClick={() => setShowGrowing((v) => !v)} className={choiceClass(showGrowing)}>
            Growing plant
          </button>
          <button type="button" aria-pressed={tend} onClick={() => setTend((v) => !v)} className={choiceClass(tend)}>
            Tend
          </button>
          <button type="button" aria-pressed={pickable} onClick={() => setPickable((v) => !v)} className={choiceClass(pickable)}>
            Pickable
          </button>
          <button type="button" aria-pressed={tendable} onClick={() => setTendable((v) => !v)} className={choiceClass(tendable)}>
            Tendable
          </button>
          <button type="button" aria-pressed={dark} onClick={toggleDark} className={choiceClass(dark)}>
            Dark theme
          </button>
          <button type="button" onClick={() => setMount((m) => m + 1)} className={choiceClass(false)}>
            Remount with outcome
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-zinc-400 sm:col-span-2">
          Grid {n} × {n}. Selected spot: {spot ? `${spot.x}, ${spot.y}` : "none"}. Tree to tend:{" "}
          {tendTree ? `${tendTree.id} (stage ${tendTree.stage} at ${tendTree.x}, ${tendTree.y})` : "none"}.
        </p>
      </div>
    </div>
  );
}
