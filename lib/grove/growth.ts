/** Sixteen intervals plus the seed / initial shoot at zero. No wall-clock state is stored. */
export const GROWTH_STEPS = 16;

export function growthFrame(progress: number): number {
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return Math.floor(t * GROWTH_STEPS);
}
