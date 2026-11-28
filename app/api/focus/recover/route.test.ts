import { beforeEach, expect, it, vi } from "vitest";
import { OWNER_HEADER } from "@/lib/focus/accountStorage";
const mock = vi.hoisted(() => ({ user: vi.fn(), sessions: vi.fn(), tasks: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUser: mock.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { focusSession: { findMany: mock.sessions }, task: { findMany: mock.tasks } } }));
import { POST } from "./route";
const claim = (id: string | null, startedAt: number, taskIds: string[]) => ({ id, startedAt, taskIds });
const request = (claims: unknown, owner = "fixture") => new Request("https://example.test/api/focus/recover", { method: "POST", headers: { [OWNER_HEADER]: owner }, body: JSON.stringify(claims) });

beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue("fixture"); });
it("verifies known starts even after task deletion, lost start replies, and offline starts with an owned task", async () => {
  mock.sessions.mockResolvedValue([{ id: "known", startedAt: new Date(10), taskIds: '["deleted"]' }, { id: "lost", startedAt: new Date(20), taskIds: '["gone"]' }]);
  mock.tasks.mockResolvedValue([{id: "completed"}]);
  const r = await POST(request([claim("known",10,["deleted"]), claim(null,20,["gone"]), claim(null,30,["deleted","completed"]), claim("other",40,["completed"]), claim(null,50,["unknown"])]));
  expect(await r.json()).toEqual({owned: [10,20,30]});
  for (const query of [mock.sessions, mock.tasks]) expect(query).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({userId: "fixture"})}));
});
it("rejects stale identities and malformed claims before querying", async () => {
  expect((await POST(request([], "other"))).status).toBe(401);
  expect((await POST(request([claim(null,1e25,["x"])]))).status).toBe(400);
  expect(mock.sessions).not.toHaveBeenCalled(); expect(mock.tasks).not.toHaveBeenCalled();
});
