import type { Outcome } from "@/lib/focus/session";

/**
 * Moves `current` toward `target`, halving the remaining gap every
 * `halfLifeMs`. Snaps to the target when the gap is tiny, or when `dtMs` is
 * over 2 s (a tab coming back from hidden must not replay a long animation).
 */
export function approach(current: number, target: number, dtMs: number, halfLifeMs: number): number {
  if (dtMs > 2000 || halfLifeMs <= 0) return target;
  const next = target + (current - target) * Math.pow(0.5, Math.max(0, dtMs) / halfLifeMs);
  return Math.abs(target - next) < 0.001 ? target : next;
}

/** How grown a withered plant is drawn: the same small size on every screen. */
export const WITHERED_GROWTH = 0.35;

/**
 * What the growing plant should show for its progress and outcome. A tend
 * (`tend: true`, a tree growing into its next stage) is never lost by
 * withering: given up or left, it goes back to growth 0, which is the tree's
 * old stage at full size.
 */
export function shownGrowth(growing: { progress: number; outcome: Outcome | null; tend?: boolean }): { growth: number; withered: number } {
  switch (growing.outcome) {
    case "COMPLETED":
    case "CLEARED":
      return { growth: 1, withered: 0 };
    case "GAVE_UP":
    case "LEFT":
      if (growing.tend) return { growth: 0, withered: 0 };
      return { growth: Math.min(growing.progress, WITHERED_GROWTH), withered: 1 };
    default:
      return { growth: growing.progress, withered: 0 };
  }
}
