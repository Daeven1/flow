"use client";

/**
 * The grove box. Pages import this, never GroveCanvas: the canvas (and
 * three.js with it) is loaded only in the browser, on demand, so no other
 * page's bundle carries it.
 */
import dynamic from "next/dynamic";
import { useCallback, useState, type ReactNode } from "react";
import type { GrovePlant, Spot } from "@/lib/grove/layout";
import type { Growing } from "./GroveCanvas";

export type { Growing } from "./GroveCanvas";

export type GroveProps = {
  plants: GrovePlant[];
  growing?: Growing | null;
  pickable?: boolean; // show free spots and let one be chosen
  selectedSpot?: Spot | null;
  onPickSpot?: (spot: Spot) => void;
  label: string; // accessible name, e.g. "Your grove: 12 plants"
  className?: string; // sizes the box; the canvas fills it
  fallback?: ReactNode; // shown instead when WebGL is unavailable
};

/** A quiet island silhouette, the same size as the canvas, while it loads. */
function Placeholder({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} className="absolute inset-0 flex items-center justify-center">
      <div className="h-[34%] w-[62%] max-w-[420px] rounded-[50%] bg-emerald-800/10 dark:bg-emerald-300/[0.07]" />
    </div>
  );
}

const GroveCanvas = dynamic(() => import("./GroveCanvas"), {
  ssr: false,
  loading: () => <Placeholder label="Loading your grove" />,
});

export function Grove({ className, fallback, label, ...rest }: GroveProps) {
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const box = `relative ${className ?? "w-full aspect-[4/3]"}`;

  if (failed) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div className={box}>
        <Placeholder label={label} />
      </div>
    );
  }

  return (
    <div className={box}>
      <GroveCanvas {...rest} label={label} onFail={onFail} />
    </div>
  );
}
