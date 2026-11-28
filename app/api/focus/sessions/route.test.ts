import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_HEADER } from "@/lib/focus/accountStorage";
import { POST } from "./route";

const mock = vi.hoisted(() => ({
  user: vi.fn(), transaction: vi.fn(), balance: vi.fn(), tree: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getUser: mock.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/lib/grove/seedStore", () => ({ seedBalance: mock.balance }));

const owner = "fixture-account";
const firstStart = "2027-01-05T08:00:00.000Z";
const free = { species: "FERN", x: 1, y: -1 };
const paid = { species: "TREE", x: 0, y: 0 };
const tend = { ...paid, tendId: "fixture-tree" };
type Saved = { id: string; userId: string; startedAt: Date; plantCost: number; plantSpecies: string | null; tendPlantId: string | null };
const rows: Saved[] = [];
const locks = new Map<string, Promise<void>>();
let loseCommitResponse = false;

function start(plant: unknown = null, startedAt = firstStart, header: string | null = owner) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (header) headers.set(OWNER_HEADER, header);
  return POST(new Request("https://example.invalid/api/focus/sessions", {
    method: "POST", headers,
    body: JSON.stringify({ plant, startedAt, taskIds: ["fixture-task"], rule: "STRICT", plannedMinutes: 25 }),
  }));
}

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.stubEnv("GROVE_NAMED_PLANT_STARTS", undefined);
  vi.resetAllMocks();
  rows.length = 0;
  locks.clear();
  loseCommitResponse = false;
  mock.user.mockResolvedValue(owner);
  mock.balance.mockImplementation(async () => 3 - rows.reduce((sum, row) => sum + row.plantCost, 0));
  mock.tree.mockResolvedValue({ id: tend.tendId, species: "TREE", status: "ALIVE", stage: 1, x: 2, y: 3, plantedAt: new Date(firstStart), witheredAt: null });

  // Transactions overlap until the account lock is actually requested.
  mock.transaction.mockImplementation(async (run, options) => {
    expect(options).toEqual({ isolationLevel: "ReadCommitted" });
    let lockedOwner: string | undefined;
    let release: (() => void) | undefined;
    let pending: Saved | undefined;
    const tx = {
      $executeRaw: async (sql: TemplateStringsArray, userId: string) => {
        expect(sql.join("?")).toBe("SELECT pg_advisory_xact_lock(hashtext(?))");
        const previous = locks.get(userId);
        locks.set(userId, new Promise<void>((resolve) => { release = resolve; }));
        await previous;
        lockedOwner = userId;
      },
      focusSession: {
        findFirst: async ({ where }: { where: { userId: string; startedAt: Date } }) => {
          expect(lockedOwner).toBe(where.userId);
          return rows.find((row) => row.userId === where.userId && +row.startedAt === +where.startedAt) ?? null;
        },
        create: async ({ data }: { data: Omit<Saved, "id"> }) => {
          expect(lockedOwner).toBe(data.userId);
          pending = { ...data, id: "session-" + (rows.length + 1) };
          return pending;
        },
      },
      grovePlant: { findFirst: mock.tree },
    };
    try {
      const result = await run(tx);
      if (pending) rows.push(pending);
      if (loseCommitResponse) {
        loseCommitResponse = false;
        throw new Error("Commit acknowledgement lost");
      }
      return result;
    } finally {
      release?.();
    }
  });
});

describe("focus session start retries", () => {
  it.each([
    { label: "no plant", choice: null, species: null, cost: 0 },
    { label: "free plant", choice: free, species: "FERN", cost: 0 },
    { label: "paid plant", choice: paid, species: "TREE", cost: 3 },
    { label: "tending", choice: tend, species: "TREE", cost: 0 },
  ])("stores one $label start for overlapping tabs and a later lost-response retry", async ({ choice, species, cost }) => {
    const [first, second] = await Promise.all([start(choice), start(choice)]);
    const replay = await start(choice);
    for (const res of [first, second, replay]) {
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: "session-1", plantAccepted: true });
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plantSpecies: species, plantCost: cost, tendPlantId: choice === tend ? tend.tendId : null });
    expect(mock.balance).toHaveBeenCalledTimes(cost ? 1 : 0);
    expect(mock.tree).toHaveBeenCalledTimes(choice === tend ? 1 : 0);
  });

  it("recovers the committed paid start when the database reply is lost", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      loseCommitResponse = true;
      const res = await start(paid);
      expect(await res.json()).toEqual({ id: "session-1", plantAccepted: true });
      expect(mock.transaction).toHaveBeenCalledTimes(2);
      expect(mock.balance).toHaveBeenCalledTimes(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].plantCost).toBe(3);
    } finally { log.mockRestore(); }
  });

  it("creates one no-cost fallback when overlapping paid lookups fail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mock.balance.mockRejectedValue(new Error("Seed lookup unavailable"));
      const responses = await Promise.all([start(paid), start(paid)]);
      const bodies = await Promise.all(responses.map((res) => res.json()));
      for (const body of bodies) expect(body).toMatchObject({ id: "session-1", plantAccepted: false });
      expect(bodies).toContainEqual({ id: "session-1", plantAccepted: false, dropReason: "ERROR" });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ plantCost: 0, plantSpecies: null });
    } finally { log.mockRestore(); }
  });

  it("honours the balance across two distinct starts", async () => {
    const responses = await Promise.all([start(paid), start(paid, "2027-01-05T08:30:00.000Z")]);
    const bodies = await Promise.all(responses.map((res) => res.json()));
    expect(new Set(bodies.map((body) => body.id)).size).toBe(2);
    expect(bodies.filter((body) => body.plantAccepted)).toHaveLength(1);
    expect(rows.map((row) => row.plantCost).sort()).toEqual([0, 3]);
  });

  it("rejects a stale owner before touching the database and accepts an older caller without the header", async () => {
    expect((await start(free, firstStart, "other-account")).status).toBe(401);
    expect(mock.transaction).not.toHaveBeenCalled();
    expect((await start(free, firstStart, null)).status).toBe(201);
  });
});

describe("named plant rollout", () => {
  it.each(["CHICORY", "PAPER_BIRCH"])("keeps the timer and rejects a stale %s start without charging", async (species) => {
    const choice = { ...free, species };
    const first = await start(choice);
    vi.stubEnv("GROVE_NAMED_PLANT_STARTS", "1");
    const retry = await start(choice);
    for (const response of [first, retry]) {
      expect(await response.json()).toEqual({ id: "session-1", plantAccepted: false, dropReason: "UNAVAILABLE" });
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plantSpecies: null, plantCost: 0, tendPlantId: null });
    expect(mock.balance).not.toHaveBeenCalled();
    expect(mock.tree).not.toHaveBeenCalled();
  });

  it.each([["CHICORY", 0], ["PAPER_BIRCH", 3]] as const)("keeps an accepted %s on retry after the gate closes", async (species, cost) => {
    const choice = { ...free, species };
    vi.stubEnv("GROVE_NAMED_PLANT_STARTS", "1");
    const first = await start(choice);
    vi.stubEnv("GROVE_NAMED_PLANT_STARTS", "0");
    const retry = await start(choice);
    for (const response of [first, retry]) {
      expect(await response.json()).toEqual({ id: "session-1", plantAccepted: true });
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plantSpecies: species, plantCost: cost });
    expect(mock.balance).toHaveBeenCalledTimes(cost ? 1 : 0);
  });

  it("keeps the gate closed in the fallback transaction", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mock.transaction.mockRejectedValueOnce(new Error("Retry transaction"));
    try {
      const response = await start({ ...free, species: "CHICORY" });
      expect(await response.json()).toEqual({ id: "session-1", plantAccepted: false, dropReason: "UNAVAILABLE" });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ plantSpecies: null, plantCost: 0 });
    } finally { log.mockRestore(); }
  });

  it("tends the owner's established named tree with the gate closed, verifying its identity", async () => {
    const choice = { ...tend, species: "WHITE_SPRUCE" };
    mock.tree.mockResolvedValue({ ...choice, id: tend.tendId, x: 3, y: 0, stage: 1, status: "ALIVE", plantedAt: new Date(firstStart), witheredAt: null });
    const response = await start(choice);
    expect(await response.json()).toEqual({ id: "session-1", plantAccepted: true });
    expect(mock.tree).toHaveBeenCalledWith({ where: { id: tend.tendId, userId: owner } });
    expect(rows[0]).toMatchObject({ plantSpecies: "WHITE_SPRUCE", plantCost: 0, tendPlantId: tend.tendId });
    const mismatch = await start({ ...choice, species: "PAPER_BIRCH" }, "2027-01-05T08:30:00Z");
    expect(await mismatch.json()).toEqual({ id: "session-2", plantAccepted: false });
    expect(rows[1]).toMatchObject({ plantSpecies: null, plantCost: 0, tendPlantId: null });
    expect(mock.balance).not.toHaveBeenCalled();
  });
});
