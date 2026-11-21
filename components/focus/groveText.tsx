"use client";

import { useEffect } from "react";
import type { Species } from "@/lib/grove/layout";

/** Display name, capitalised for buttons; lower case inside sentences. */
export function speciesName(s: Species, inSentence = false): string {
  const name = { WILDFLOWERS: "Wildflowers", FERN: "Fern", BERRY_BUSH: "Berry bush", TREE: "Tree" }[s];
  return inSentence ? name.toLowerCase() : name;
}

export function plantCount(n: number): string {
  return `${n} ${n === 1 ? "plant" : "plants"}`;
}

export const NO_WEBGL_LINE = "This device can't draw the grove, so here's a plain timer.";

/** Put inside a Grove `fallback` to learn that WebGL is unavailable. Renders nothing. */
export function OnFallback({ onShow }: { onShow: () => void }) {
  // Once, when the fallback first shows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onShow(), []);
  return null;
}
