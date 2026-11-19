"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSpecies, type GrovePlant } from "./layout";

export type GroveStatus = "loading" | "loaded" | "failed";

function isPlant(v: unknown): v is GrovePlant {
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
  return plants.filter(isPlant);
}

/**
 * The user's grove, fetched once on mount and again on refresh(). A failed
 * refresh keeps the last good list. A response that arrives after unmount or
 * after a newer request is ignored.
 */
export function useGrove(): { plants: GrovePlant[]; status: GroveStatus; refresh(): void } {
  const [plants, setPlants] = useState<GrovePlant[]>([]);
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

  return { plants, status, refresh };
}
