import { describe, expect, it } from "vitest";
import { hasLanded, withPendingPlant, type PendingPlant } from "./pending";
import type { GrovePlant } from "./layout";

const START = Date.parse("2026-11-19T08:00:00.000Z");
const END = Date.parse("2026-11-19T08:25:00.000Z");
const ended = (outcome: PendingPlant["outcome"], over: Partial<PendingPlant> = {}): PendingPlant => ({
  species: "FERN", x: 0, y: -1, outcome, startedAt: START, endedAt: END, ...over,
});
const old: GrovePlant = {
  id: "p1", species: "WILDFLOWERS", x: -1, y: -1, status: "ALIVE",
  plantedAt: "2026-11-18T08:00:00.000Z", witheredAt: null,
};

describe("withPendingPlant", () => {
  it("adds the plant when the grove does not have it yet", () => {
    const out = withPendingPlant([old], ended("COMPLETED"));
    expect(out).toEqual([
      old,
      {
        id: `pending:${START}`, species: "FERN", x: 0, y: -1, status: "ALIVE",
        plantedAt: new Date(END).toISOString(), witheredAt: null,
      },
    ]);
  });

  it("keeps it alive for a finished session and withers it for a lost one", () => {
    expect(withPendingPlant([], ended("CLEARED"))[0]).toMatchObject({ status: "ALIVE", witheredAt: null });
    expect(withPendingPlant([], ended("GAVE_UP"))[0]).toMatchObject({
      status: "WITHERED", witheredAt: new Date(END).toISOString(),
    });
    expect(withPendingPlant([], ended("LEFT"))[0]).toMatchObject({ status: "WITHERED" });
  });

  it("drops it once the grove has a plant on that spot planted at or after the session start", () => {
    const saved: GrovePlant = { ...old, id: "p2", species: "FERN", x: 0, y: -1, plantedAt: new Date(END).toISOString() };
    expect(withPendingPlant([old, saved], ended("COMPLETED"))).toEqual([old, saved]);
    const atStart = { ...saved, plantedAt: new Date(START).toISOString() };
    expect(withPendingPlant([atStart], ended("COMPLETED"))).toEqual([atStart]);
    expect(hasLanded([saved], ended("COMPLETED"))).toBe(true);
  });

  it("drops it when the server moved it: same species planted since the start, elsewhere", () => {
    const moved: GrovePlant = { ...old, id: "p3", species: "FERN", x: 2, y: 2, plantedAt: new Date(END).toISOString() };
    expect(withPendingPlant([moved], ended("COMPLETED"))).toEqual([moved]);
  });

  it("does not take a later session's plant of the same species elsewhere for this one", () => {
    const later: GrovePlant = { ...old, id: "p4", species: "FERN", x: 2, y: 2, plantedAt: new Date(END + 60_000).toISOString() };
    expect(hasLanded([later], ended("COMPLETED"))).toBe(false);
  });

  it("does not count an older plant on that spot as the saved one, and moves off it like the server", () => {
    const before: GrovePlant = { ...old, x: 0, y: -1, plantedAt: new Date(START - 1).toISOString() };
    expect(hasLanded([before], ended("COMPLETED"))).toBe(false);
    const out = withPendingPlant([before], ended("COMPLETED"));
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe(`pending:${START}`);
    expect({ x: out[1].x, y: out[1].y }).not.toEqual({ x: 0, y: -1 });
  });
});
