"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSpecies, MAX_STAGE, type GrovePlant } from "./layout";

export type GroveStatus = "loading" | "loaded" | "failed";

function isPlant(v: unknown): v is Omit<GrovePlant, "stage"> {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    isSpecies(p.species) &&
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    (p.status === "ALIVE" || p.status === "WITHERED") &&
    typeof p.plantedAt === "string" &&
    (p.witheredAt === null || typeof p.witheredAt === "string")
  );
}

/** The plants in a `/api/grove` response, or null if it is not one. Bad rows are dropped. */
export function parseGrove(body: unknown): GrovePlant[] | null {
  if (typeof body !== "object" || body === null) return null;
  const plants = (body as Record<string, unknown>).plants;
  if (!Array.isArray(plants)) return null;
  return plants.filter(isPlant).map((p) => {
    const stage = (p as { stage?: unknown }).stage;
    return {
      ...p,
      stage: typeof stage === "number" && Number.isInteger(stage) && stage >= 1 && stage <= MAX_STAGE ? stage : 1,
    };
  });
}

/** The seed balance in a `/api/grove` response (never below 0), or null if it has none. */
export function parseSeeds(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const seeds = (body as Record<string, unknown>).seeds;
  if (typeof seeds !== "number" || !Number.isInteger(seeds)) return null;
  return Math.max(0, seeds);
}

/**
 * The user's grove and seed balance, fetched once on mount and again on refresh(). A failed
 * refresh keeps the last good list and balance. A response that arrives after unmount or
 * after a newer request is ignored.
 */
export function useGrove(): {
  plants: GrovePlant[];
  seeds: number | null; // null until a load carries a balance
  status: GroveStatus;
  refresh(): void;
} {
  const [plants, setPlants] = useState<GrovePlant[]>([]);
  const [seeds, setSeeds] = useState<number | null>(null);
  const [status, setStatus] = useState<GroveStatus>("loading");
  const latest = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(() => {
    const req = ++latest.current;
    const current = () => mounted.current && req === latest.current;
    fetch(`/api/grove?tz=${new Date().getTimezoneOffset()}`)
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json() as Promise<unknown>;
      })
      .then((body) => {
        const list = parseGrove(body);
        if (!list) throw new Error("not a grove");
        if (!current()) return;
        setPlants(list);
        const balance = parseSeeds(body);
        if (balance !== null) setSeeds(balance);
        setStatus("loaded");
      })
      .catch(() => {
        if (!current()) return;
        setStatus((s) => (s === "loaded" ? s : "failed"));
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { plants, seeds, status, refresh };
}
