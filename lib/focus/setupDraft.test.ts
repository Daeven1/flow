import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft, readDraft, writeDraft } from "./setupDraft";

const work = "grove-focus-setup:example:PROFESSIONAL";
const home = "grove-focus-setup:example:PERSONAL";

describe("unfinished Focus setup", () => {
  let rows: Map<string, string>;
  beforeEach(() => {
    rows = new Map();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => rows.set(key, value),
      removeItem: (key: string) => rows.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("restores the setup step, task order and selected options independently for each workspace and account", () => {
    const draft = emptyDraft();
    draft.taskIds = ["third-pick", "first-pick"];
    draft.choosing = true;
    draft.options = { length: 30, rule: "GENTLE", choice: "TEND", spot: null, treeId: "tree", customizingPlant: true };
    writeDraft(work, draft);
    expect(readDraft(work)).toEqual(draft);
    expect(readDraft(home)).toEqual(emptyDraft());
    expect(readDraft("grove-focus-setup:another:PROFESSIONAL")).toEqual(emptyDraft());
    writeDraft(work, emptyDraft());
    expect(rows.has(work)).toBe(false);
    expect(readDraft(work)).toEqual(emptyDraft());
  });

  it("keeps valid task picks if stored options are incomplete or invalid", () => {
    rows.set(work, JSON.stringify({ taskIds: ["two", 4, "one", "two"], choosing: true,
      options: { length: 90, rule: "unknown", choice: "unknown", spot: { x: "A", y: 3 } } }));
    expect(readDraft(work)).toEqual({ ...emptyDraft(), taskIds: ["two", "one"], choosing: true });
    rows.set(work, "{");
    expect(readDraft(work)).toEqual(emptyDraft());
  });

  it("retains a draft in the same tab when browser storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);
    const key = "grove-focus-setup:offline:PERSONAL";
    const draft = { ...emptyDraft(), taskIds: ["sketch"] };
    writeDraft(key, draft);
    expect(readDraft(key)).toEqual(draft);
    writeDraft(key, emptyDraft());
    expect(readDraft(key)).toEqual(emptyDraft());
  });
});
