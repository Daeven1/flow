import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const mock = vi.hoisted(() => ({ user: vi.fn(), findMany: vi.fn(), seeds: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUser: mock.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { grovePlant: { findMany: mock.findMany } } }));
vi.mock("@/lib/grove/seedStore", () => ({ seedBalance: mock.seeds }));

const request = () => new Request("https://example.invalid/api/grove?tz=0");
const existing = {
  id: "fixture-chicory", species: "CHICORY", x: 1, y: 0, status: "ALIVE",
  plantedAt: new Date("2027-01-01T08:00:00Z"), witheredAt: null, stage: 1,
};

beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue("fixture-account");
  mock.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([existing]);
  mock.seeds.mockResolvedValue(4);
});
afterEach(() => vi.unstubAllEnvs());

it.each([[undefined, false], ["true", false], ["1", true]] as const)(
  "reads established named plants and exposes only the configured capability (%s)",
  async (value, expected) => {
    vi.stubEnv("GROVE_NAMED_PLANT_STARTS", value);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plants: [{ ...existing, plantedAt: existing.plantedAt.toISOString() }],
      seeds: 4, namedPlantStarts: expected,
    });
    expect(mock.findMany).toHaveBeenCalledWith({ where: { userId: "fixture-account" }, orderBy: { plantedAt: "asc" } });
  },
);

it("requires the authenticated owner before reading their garden", async () => {
  mock.user.mockResolvedValue(null);
  const res = await GET(request());
  expect(res.status).toBe(401);
  expect(mock.findMany).not.toHaveBeenCalled();
});
