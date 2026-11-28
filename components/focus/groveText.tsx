"use client";

import { useEffect } from "react";
import { SPECIES_INFO, type Species } from "@/lib/grove/species";

/** Display name, capitalised for buttons; lower case inside sentences. */
export function speciesName(s: Species, inSentence = false): string {
  const name = SPECIES_INFO[s].name;
  return inSentence && s !== "CANADA_COLUMBINE" ? name.toLowerCase() : name;
}

/** The name on a "What to grow" button: a new tree starts as a sapling. */
export function speciesButtonName(s: Species): string {
  return s === "TREE" ? "Sapling" : speciesName(s);
}

/** "Your fern is growing." Wildflowers are plural. */
export function growingLine(s: Species): string {
  return `Your ${speciesName(s, true)} ${s === "WILDFLOWERS" ? "are" : "is"} growing.`;
}

export function plantCount(n: number): string {
  return `${n} ${n === 1 ? "plant" : "plants"}`;
}

export function seedCount(n: number): string {
  return `${n} ${n === 1 ? "seed" : "seeds"}`;
}

export const TEND_HINT = "Tap a sapling or young tree to tend it.";

/** Why a session's plant was turned down at start, for the session view and end screen. */
export const DROPPED_LINE = {
  UNAVAILABLE: "That plant isn’t available for a new session right now. Your timer will run without a plant.",
  SEEDS: "There weren't enough seeds for that plant, so this is a plain session.",
  TEND: "That tree can't be tended right now, so this is a plain session.",
  ERROR: "Something went wrong saving your plant, so this is a plain session.",
} as const;

export const NO_WEBGL_LINE = "This device can't draw the grove, so here's a plain timer.";

/** Put inside a Grove `fallback` to learn that WebGL is unavailable. Renders nothing. */
export function OnFallback({ onShow }: { onShow: () => void }) {
  // Once, when the fallback first shows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onShow(), []);
  return null;
}
