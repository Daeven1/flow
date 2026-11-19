import { describe, expect, it } from "vitest";
import { parseGrove } from "./useGrove";

const plant = {
  id: "p1", species: "FERN", x: 0, y: -1, status: "ALIVE",
  plantedAt: "2026-11-19T08:00:00.000Z", witheredAt: null,
};

describe("parseGrove", () => {
  it("returns the plants of a good response", () => {
    expect(parseGrove({ plants: [plant] })).toEqual([plant]);
    expect(parseGrove({ plants: [] })).toEqual([]);
  });

  it("rejects a response that is not a grove", () => {
    expect(parseGrove(null)).toBeNull();
    expect(parseGrove([plant])).toBeNull();
    expect(parseGrove({ error: "Unauthorized" })).toBeNull();
    expect(parseGrove({ plants: "nope" })).toBeNull();
  });

  it("drops rows that are not plants", () => {
    const bad = [
      { ...plant, species: "OAK" },
      { ...plant, x: 0.5 },
      { ...plant, status: "DEAD" },
      { ...plant, witheredAt: 3 },
      "plant",
    ];
    expect(parseGrove({ plants: [...bad, plant] })).toEqual([plant]);
  });
});
