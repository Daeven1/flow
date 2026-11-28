import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), key: vi.fn(), transaction: vi.fn(), seeds: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getUser: mocks.getUser }));
vi.mock("@/lib/remindersAuth", () => ({ validateApiKey: mocks.key }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, task: { update: mocks.update } } }));
vi.mock("@/lib/grove/seedStore", () => ({ addSeeds: mocks.seeds }));
vi.mock("@/lib/workNightDays", () => ({ getWorkNightDays: async () => [1] }));

const id = "fictional-origami";
const owner = "fictional-owner";
type Row = { id: string; userId: string; done: boolean; doneAt: Date | null; name: string; project: null };
let row: Row;
let writes: number;
let releasePrevious: Promise<void>;

function patch(data: Record<string, unknown>, target = id) {
  return PATCH(new Request("https://example.invalid/api/tasks/" + target, {
    method: "PATCH", body: JSON.stringify(data),
  }), { params: Promise.resolve({ id: target }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  row = { id, userId: owner, done: false, doneAt: null, name: "Fold paper shapes", project: null };
  writes = 0;
  releasePrevious = Promise.resolve();
  mocks.getUser.mockResolvedValue(owner);
  // Transactions can overlap. The fake row lock serializes only once the
  // implementation actually issues the parameterized owner-scoped SELECT.
  mocks.transaction.mockImplementation(async fn => {
    let unlock: (() => void) | undefined;
    let next: Row | undefined;
    const tx = {
      async $queryRaw(sql: TemplateStringsArray, taskId: string, userId: string) {
        expect(sql.join("?").replace(/\s+/g, " ")).toContain('WHERE "id" = ? AND "userId" = ? FOR UPDATE');
        if (taskId !== row.id || userId !== row.userId) return [];
        const wait = releasePrevious;
        releasePrevious = new Promise<void>(resolve => { unlock = resolve; });
        await wait;
        return [{ done: row.done, doneAt: row.doneAt }];
      },
      task: {
        async update({ where, data, include }: { where: object; data: Partial<Row>; include: object }) {
          expect(where).toEqual({ id, userId: owner });
          expect(include).toEqual({ project: true });
          expect(unlock).toBeDefined();
          next = { ...row, ...data };
          return next;
        },
        async findUniqueOrThrow({ where, include }: { where: object; include: object }) {
          expect(where).toEqual({ id, userId: owner });
          expect(include).toEqual({ project: true });
          return row;
        },
      },
    };
    try {
      const result = await fn(tx);
      if (next) { row = next; writes++; }
      return result;
    } finally {
      unlock?.();
    }
  });
});

describe("web task check-off", () => {
  it("confirms one change and awards once for overlapping taps and a lost-response retry", async () => {
    const responses = await Promise.all([patch({ done: true }), patch({ done: true })]);
    const replay = await patch({ done: true });
    expect(responses.map(r => r.headers.get("Grove-Completion-Changed")).sort()).toEqual(["0", "1"]);
    expect(replay.headers.get("Grove-Completion-Changed")).toBe("0");
    expect(writes).toBe(1);
    expect(mocks.seeds).toHaveBeenCalledTimes(1);
    expect(mocks.seeds).toHaveBeenCalledWith(expect.objectContaining({ $queryRaw: expect.any(Function) }), owner, 1);
    const first = await responses[0].json();
    expect(first).toMatchObject({ id, done: true, project: null, doneAt: expect.any(String) });
    expect(await responses[1].json()).toEqual(first);
    expect(await replay.json()).toEqual(first);
  });

  it("saves other requested fields and preserves doneAt on a duplicate completion", async () => {
    const first = await (await patch({ done: true })).json();
    const second = await patch({ done: true, name: "Pack paper shapes" });
    expect(second.headers.get("Grove-Completion-Changed")).toBe("0");
    expect(await second.json()).toMatchObject({ ...first, name: "Pack paper shapes" });
    expect(mocks.seeds).toHaveBeenCalledTimes(1);
  });

  it.each([["2020-01-01", 0], ["2027-01-01", -1]])("keeps the original seed cutoff when reopening a task completed on %s", async (date, delta) => {
    row = { ...row, done: true, doneAt: new Date(date) };
    const response = await patch({ done: false });
    expect(response.headers.get("Grove-Completion-Changed")).toBe("1");
    expect(await response.json()).toMatchObject({ done: false, doneAt: null });
    expect(mocks.seeds).toHaveBeenCalledWith(expect.anything(), owner, delta);
  });

  it("rolls the task back if saving the seed fails", async () => {
    mocks.seeds.mockRejectedValueOnce(new Error("fictional write failure"));
    await expect(patch({ done: true })).rejects.toThrow("fictional write failure");
    expect(row.done).toBe(false);
    expect(writes).toBe(0);
    expect((await patch({ done: true })).headers.get("Grove-Completion-Changed")).toBe("1");
  });

  it("rejects unknown, unowned, and signed-out check-offs without writing", async () => {
    expect((await patch({ done: true }, "missing")).status).toBe(404);
    mocks.getUser.mockResolvedValue("someone-else");
    expect((await patch({ done: true })).status).toBe(404);
    mocks.getUser.mockResolvedValue(null);
    expect((await patch({ done: true })).status).toBe(401);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(writes).toBe(0);
    expect(mocks.seeds).not.toHaveBeenCalled();
  });

  it.each(["true", 1, null])("rejects non-boolean done (%j)", async done => {
    expect((await patch({ done })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves the existing authenticated Shortcuts write-back shape", async () => {
    mocks.getUser.mockResolvedValue(null);
    mocks.key.mockReturnValue(owner);
    mocks.update.mockResolvedValue({ ...row, reminderId: "fictional-reminder" });
    const response = await patch({ reminderId: "fictional-reminder" });
    expect(await response.json()).toMatchObject({ id, reminderId: "fictional-reminder" });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id, userId: owner }, data: { reminderId: "fictional-reminder" }, include: { project: true },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
