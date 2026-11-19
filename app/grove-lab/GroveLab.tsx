"use client";

import { useEffect, useMemo, useState } from "react";
import { Grove, type Growing } from "@/components/grove/Grove";
import { defaultSpot, freeSpots, gridSize, type GrovePlant, type Species, type Spot } from "@/lib/grove/layout";
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
 * checked against earlier plants staying put. Species alternate; every
 * seventh plant is withered.
 */
function labPlants(count: number): GrovePlant[] {
  const out: GrovePlant[] = [];
  for (let i = 0; i < count; i++) {
    const spot = defaultSpot(gridSize(i + 1), out)!;
    out.push({
      id: `lab-${i}`,
      species: i % 2 === 0 ? "WILDFLOWERS" : "FERN",
      x: spot.x,
      y: spot.y,
      status: i % 7 === 6 ? "WITHERED" : "ALIVE",
      plantedAt: "2026-11-01T08:00:00.000Z",
      witheredAt: i % 7 === 6 ? "2026-11-01T08:30:00.000Z" : null,
    });
  }
  return out;
}

const OUTCOMES: { label: string; value: Outcome | null }[] = [
  { label: "None", value: null },
  { label: "Completed", value: "COMPLETED" },
  { label: "Gave up", value: "GAVE_UP" },
];

export default function GroveLab() {
  const [count, setCount] = useState(12);
  const [growth, setGrowth] = useState(50);
  const [species, setSpecies] = useState<Species>("WILDFLOWERS");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showGrowing, setShowGrowing] = useState(true);
  const [pickable, setPickable] = useState(false);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [dark, setDark] = useState(false);

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

  const growing = useMemo<Growing | null>(
    () => (showGrowing && spot ? { species, spot, progress: growth / 100, outcome } : null),
    [showGrowing, spot, species, growth, outcome],
  );

  const total = count + (growing ? 1 : 0);
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
        plants={plants}
        growing={growing}
        pickable={pickable}
        selectedSpot={spot}
        onPickSpot={setPicked}
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
          <div role="group" aria-labelledby="lab-species" className="flex gap-2">
            {(["WILDFLOWERS", "FERN"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={species === s} onClick={() => setSpecies(s)} className={choiceClass(species === s)}>
                {s === "FERN" ? "Fern" : "Wildflowers"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div id="lab-outcome" className={labelClass}>Outcome</div>
          <div role="group" aria-labelledby="lab-outcome" className="flex gap-2">
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
          <button type="button" aria-pressed={pickable} onClick={() => setPickable((v) => !v)} className={choiceClass(pickable)}>
            Pickable
          </button>
          <button type="button" aria-pressed={dark} onClick={toggleDark} className={choiceClass(dark)}>
            Dark theme
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-zinc-400 sm:col-span-2">
          Grid {n} × {n}. Selected spot: {spot ? `${spot.x}, ${spot.y}` : "none"}.
        </p>
      </div>
    </div>
  );
}
