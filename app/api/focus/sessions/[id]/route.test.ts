import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const db = vi.hoisted(() => ({
  getUser: vi.fn(), findSession: vi.fn(), transaction: vi.fn(), claim: vi.fn(), findTask: vi.fn(),
  initialize: vi.fn(), increment: vi.fn(), record: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getUser: db.getUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { focusSession: { findFirst: db.findSession }, $transaction: db.transaction },
}));

const userId = "sample-owner";
const id = "sample-session";
const endedAt = "2026-11-23T23:50:00.000Z";
const task = { id: "sample-task", name: "Sample sketch", sprint: 2, estMinutes: 15 };
let total: number | null;
let outcome: string | null;

function finish(result = "COMPLETED") {
  const request = new Request("https://example.invalid/api/focus/sessions/" + id, {
    method: "PATCH",
    body: JSON.stringify({ outcome: result, endedAt, segments: [{ taskId: task.id, minutes: 7 }] }),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  total = null;
  outcome = null;
  db.getUser.mockResolvedValue(userId);
  db.findSession.mockImplementation(async () => ({
    id, userId, outcome, plannedMinutes: 25, tendPlantId: null, plantSpecies: null, plantX: null, plantY: null,
  }));
  db.transaction.mockImplementation(run => run({
    focusSession: { updateMany: db.claim },
    grovePlant: { findMany: async () => [] },
    task: { findFirst: db.findTask, updateMany: db.initialize, update: db.increment },
    timeLog: { create: db.record },
  }));
  db.claim.mockImplementation(async ({ where, data }) => {
    if (where.outcome !== outcome) return { count: 0 };
    outcome = data.outcome;
    return { count: 1 };
  });
  db.findTask.mockImplementation(async () => ({ ...task, actualMinutes: total }));
  db.initialize.mockImplementation(async ({ where, data }) => {
    if (where.actualMinutes !== total) return { count: 0 };
    total = data.actualMinutes;
    return { count: 1 };
  });
  db.increment.mockImplementation(async ({ data }) => {
    if (total !== null) total += data.actualMinutes.increment;
  });
});

describe("focus time entries", () => {
  it("initializes a null task total and timestamps the focus entry at the session end", async () => {
    expect((await finish()).status).toBe(200);
    expect(db.findTask).toHaveBeenCalledWith({ where: { id: task.id, userId } });
    expect(db.record).toHaveBeenCalledWith({ data: {
      id: expect.stringMatching(/^focus_/), taskId: task.id, taskName: task.name, sprint: task.sprint,
      estMinutes: task.estMinutes, actualMinutes: 7, date: new Date(endedAt),
    } });
    expect(db.initialize).toHaveBeenCalledWith({ where: { id: task.id, actualMinutes: null }, data: { actualMinutes: 7 } });
    expect(db.increment).not.toHaveBeenCalled();
    expect(total).toBe(7);
  });

  it("increments the latest stored total when a manual correction arrives after the task read", async () => {
    total = 10;
    db.record.mockImplementation(async () => { total = 40; });
    expect((await finish("CLEARED")).status).toBe(200);
    expect(db.increment).toHaveBeenCalledWith({ where: { id: task.id }, data: { actualMinutes: { increment: 7 } } });
    expect(total).toBe(47);
  });

  it("records and increments once across concurrent and later retries", async () => {
    total = 10;
    const [first, simultaneous] = await Promise.all([finish(), finish()]);
    expect([first.status, simultaneous.status, (await finish()).status]).toEqual([200, 200, 200]);
    expect(db.claim).toHaveBeenCalledWith({ where: { id, userId, outcome: null }, data: { outcome: "COMPLETED", endedAt: new Date(endedAt) } });
    expect(db.record).toHaveBeenCalledTimes(1);
    expect(db.increment).toHaveBeenCalledTimes(1);
    expect(total).toBe(17);
  });

  it.each(["GAVE_UP", "LEFT"])("leaves task time alone when the session ended as %s", async early => {
    total = 10;
    expect((await finish(early)).status).toBe(200);
    expect(outcome).toBe(early);
    expect(db.record).not.toHaveBeenCalled();
    expect(db.initialize).not.toHaveBeenCalled();
    expect(db.increment).not.toHaveBeenCalled();
    expect(total).toBe(10);
  });
});
