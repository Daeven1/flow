import { describe, expect, it } from "vitest";
import {
  ANIMALS,
  census,
  greeting,
  newcomers,
  residents,
  type AnimalKind,
} from "./habitat";
import type { GrovePlant, Species } from "./layout";

let n = 0;
function plant(
  species: Species,
  o: Partial<GrovePlant> = {},
): GrovePlant {
  n += 1;
  return {
    id: o.id ?? `p${String(n).padStart(3, "0")}`,
    species,
    x: 0,
    y: 0,
    status: "ALIVE",
    plantedAt: `2026-11-${String(10 + (n % 10)).padStart(2, "0")}T00:00:00.000Z`,
    witheredAt: null,
    stage: 1,
    ...o,
  };
}
const many = (species: Species, k: number, o: Partial<GrovePlant> = {}) =>
  Array.from({ length: k }, () => plant(species, o));
const counts = (ps: GrovePlant[]) => census(residents(ps));
const zero = (): Record<AnimalKind, number> => ({
  BUTTERFLY: 0,
  BEE: 0,
  BIRD: 0,
  SQUIRREL: 0,
});
const c = (o: Partial<Record<AnimalKind, number>>) => ({ ...zero(), ...o });

describe("residents", () => {
  it("is empty for an empty grove", () => {
    expect(residents([])).toEqual([]);
    expect(counts([])).toEqual(zero());
  });

  it("gives one butterfly for one wildflower clump", () => {
    expect(counts([plant("WILDFLOWERS")])).toEqual(c({ BUTTERFLY: 1 }));
  });

  it("counts berry bushes as flowering, ferns and trees not", () => {
    expect(counts([plant("BERRY_BUSH")])).toEqual(c({ BUTTERFLY: 1 }));
    expect(counts([plant("FERN"), plant("TREE")])).toEqual(zero());
  });

  it("4 flowering plants: 2 butterflies, 1 bee", () => {
    expect(counts(many("WILDFLOWERS", 4))).toEqual(c({ BUTTERFLY: 2, BEE: 1 }));
  });

  it("2 and 3 flowering plants", () => {
    expect(counts(many("WILDFLOWERS", 2))).toEqual(c({ BUTTERFLY: 1, BEE: 1 }));
    expect(counts(many("WILDFLOWERS", 3))).toEqual(c({ BUTTERFLY: 2, BEE: 1 }));
  });

  it("5 flowering plants: 3 butterflies, 2 bees", () => {
    expect(counts(many("WILDFLOWERS", 5))).toEqual(c({ BUTTERFLY: 3, BEE: 2 }));
  });

  it("caps butterflies at 4 and bees at 2", () => {
    expect(counts(many("WILDFLOWERS", 20))).toEqual(c({ BUTTERFLY: 4, BEE: 2 }));
  });

  it("ignores withered plants", () => {
    const ps = [
      ...many("WILDFLOWERS", 4, { status: "WITHERED" }),
      ...many("TREE", 2, { status: "WITHERED", stage: 3 }),
    ];
    expect(counts(ps)).toEqual(zero());
    expect(counts([...ps, plant("WILDFLOWERS")])).toEqual(c({ BUTTERFLY: 1 }));
  });

  it("birds need 2 berry bushes and a young tree", () => {
    const bushes = many("BERRY_BUSH", 2);
    expect(counts(bushes).BIRD).toBe(0);
    expect(counts([...bushes, plant("TREE", { stage: 1 })]).BIRD).toBe(0);
    expect(counts([plant("BERRY_BUSH"), plant("TREE", { stage: 2 })]).BIRD).toBe(0);
    expect(counts([...bushes, plant("TREE", { stage: 2 })]).BIRD).toBe(1);
    expect(counts([...bushes, plant("TREE", { stage: 3 })]).BIRD).toBe(1);
  });

  it("adds a bird per 2 more berry bushes, up to 3", () => {
    const t = plant("TREE", { stage: 2 });
    expect(counts([...many("BERRY_BUSH", 3), t]).BIRD).toBe(1);
    expect(counts([...many("BERRY_BUSH", 4), t]).BIRD).toBe(2);
    expect(counts([...many("BERRY_BUSH", 6), t]).BIRD).toBe(3);
    expect(counts([...many("BERRY_BUSH", 12), t]).BIRD).toBe(3);
  });

  it("two mature trees give 2 squirrels and 2 more birds", () => {
    const ps = [...many("BERRY_BUSH", 2), ...many("TREE", 2, { stage: 3 })];
    expect(counts(ps)).toMatchObject({ SQUIRREL: 2, BIRD: 3 });
  });

  it("one mature tree gives 1 squirrel, even without birds", () => {
    expect(counts([plant("TREE", { stage: 3 })])).toEqual(c({ SQUIRREL: 1 }));
  });

  it("caps squirrels at 2 and birds at 5", () => {
    const ps = [...many("BERRY_BUSH", 12), ...many("TREE", 5, { stage: 3 })];
    expect(counts(ps)).toMatchObject({ SQUIRREL: 2, BIRD: 5 });
  });

  it("mature-tree bonus needs the bird rule to hold first", () => {
    expect(counts(many("TREE", 2, { stage: 3 })).BIRD).toBe(0);
  });

  it("has stable ids and homes, whatever the input order", () => {
    const ps = [
      plant("WILDFLOWERS", { id: "b", plantedAt: "2026-11-02T00:00:00Z" }),
      plant("WILDFLOWERS", { id: "a", plantedAt: "2026-11-02T00:00:00Z" }),
      plant("WILDFLOWERS", { id: "c", plantedAt: "2026-11-01T00:00:00Z" }),
    ];
    const r = residents(ps);
    expect(r).toEqual(residents([...ps].reverse()));
    expect(r.filter((x) => x.kind === "BUTTERFLY")).toEqual([
      { kind: "BUTTERFLY", id: "BUTTERFLY:0", home: "c" },
      { kind: "BUTTERFLY", id: "BUTTERFLY:1", home: "a" },
    ]);
    expect(r.find((x) => x.kind === "BEE")).toEqual({
      kind: "BEE",
      id: "BEE:0",
      home: "c",
    });
  });

  it("homes: one flower, one butterfly lives there", () => {
    const f = plant("WILDFLOWERS", { id: "only" });
    expect(residents([f])[0].home).toBe("only");
  });

  it("birds prefer trees of stage 2+, then berry bushes; squirrels mature trees", () => {
    const ps = [
      plant("TREE", { id: "sap", stage: 1, plantedAt: "2026-11-01T00:00:00Z" }),
      plant("TREE", { id: "young", stage: 2, plantedAt: "2026-11-02T00:00:00Z" }),
      plant("TREE", { id: "old", stage: 3, plantedAt: "2026-11-03T00:00:00Z" }),
      plant("BERRY_BUSH", { id: "bb1", plantedAt: "2026-11-04T00:00:00Z" }),
      plant("BERRY_BUSH", { id: "bb2", plantedAt: "2026-11-05T00:00:00Z" }),
    ];
    const r = residents(ps);
    const birds = r.filter((x) => x.kind === "BIRD");
    expect(birds.map((b) => b.home)).toEqual(["young"]);
    expect(r.filter((x) => x.kind === "SQUIRREL").map((s) => s.home)).toEqual(["old"]);
    const more = [...ps, plant("TREE", { id: "old2", stage: 3 })];
    const birds2 = residents(more).filter((x) => x.kind === "BIRD");
    expect(birds2.map((b) => b.home)).toEqual(["young", "old", "old2"]);
  });

  it("assigns homes round-robin over flowers", () => {
    const fl = many("WILDFLOWERS", 3).map((p, i) => ({
      ...p,
      id: `f${i}`,
      plantedAt: `2026-11-0${i + 1}T00:00:00Z`,
    }));
    const b = residents(fl).filter((x) => x.kind === "BUTTERFLY");
    expect(b.map((x) => x.home)).toEqual(["f0", "f1"]);
  });
});

describe("census / newcomers", () => {
  it("counts residents by kind, with every kind present", () => {
    expect(census([])).toEqual(zero());
    expect(
      census([
        { kind: "BEE", id: "BEE:0", home: "x" },
        { kind: "BEE", id: "BEE:1", home: "x" },
      ]),
    ).toEqual(c({ BEE: 2 }));
  });

  it("newcomers is the per-kind positive difference", () => {
    expect(
      newcomers(c({ BUTTERFLY: 1, BEE: 2, BIRD: 3 }), c({ BUTTERFLY: 3, BEE: 1, SQUIRREL: 1 })),
    ).toEqual(c({ BUTTERFLY: 2, SQUIRREL: 1 }));
  });

  it("lists every kind", () => {
    expect([...ANIMALS]).toEqual(["BUTTERFLY", "BEE", "BIRD", "SQUIRREL"]);
  });
});

describe("greeting", () => {
  it("one kind", () => {
    expect(greeting(c({ BUTTERFLY: 1 }))).toBe("A butterfly has found your grove.");
    expect(greeting(c({ BEE: 2 }))).toBe("Two bees have found your grove.");
    expect(greeting(c({ BIRD: 5 }))).toBe("Five birds have found your grove.");
  });
  it("two kinds", () => {
    expect(greeting(c({ BUTTERFLY: 1, BIRD: 1 }))).toBe(
      "A butterfly and a bird have found your grove.",
    );
  });
  it("three kinds", () => {
    expect(greeting(c({ BUTTERFLY: 2, BEE: 1, SQUIRREL: 1 }))).toBe(
      "Two butterflies, a bee and a squirrel have found your grove.",
    );
  });
  it("is null when nothing is new", () => {
    expect(greeting(zero())).toBeNull();
  });
});
