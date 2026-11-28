import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { proxy } from "@/proxy";

const { getUser, middlewareClient } = vi.hoisted(() => ({ getUser: vi.fn(), middlewareClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: middlewareClient }));
beforeEach(() => vi.clearAllMocks());

it("passes the exact owner route to its cookie-authenticated handler without a login redirect", async () => {
  const response = await proxy(new NextRequest("https://example.test/api/focus/owner"));
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(middlewareClient).not.toHaveBeenCalled();
});

it("returns only the verified fictional user ID with private, non-cacheable headers", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "fictional-gardener", email: "example@example.invalid" } }, error: null });
  const response = await GET();
  expect(await response.json()).toEqual({ owner: "fictional-gardener" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});

it.each([
  { data: { user: null }, error: null },
  { data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } },
  { data: { user: null }, error: { code: "bad_jwt", status: 400 } },
  { data: { user: null }, error: { status: 401 } },
])("reports confirmed sign-out without disclosing auth state details", async (result) => {
  getUser.mockResolvedValue(result);
  const response = await GET();
  expect(response.status).toBe(401);
  expect(await response.text()).toBe("");
});

it("keeps a temporary auth-service failure distinct from a confirmed sign-out", async () => {
  getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 503 } })
    .mockRejectedValueOnce(new Error("network unavailable"));
  for (let i = 0; i < 2; i++) {
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  }
});
