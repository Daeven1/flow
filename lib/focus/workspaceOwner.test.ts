import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { announceAccountChange, watchWorkspaceOwner, type WorkspaceOwner } from "./workspaceOwner";

const verified = (id: string) => ({ state: "verified", id });
const signedIn = (owner: string) => Response.json({ owner });
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
let observed: WorkspaceOwner[];
let watch: ReturnType<typeof watchWorkspaceOwner> | undefined;
let request = vi.fn<typeof fetch>();
let page: EventTarget;
let stored: Map<string, string>;

beforeEach(() => {
  observed = [];
  stored = new Map();
  page = new EventTarget();
  request = vi.fn<typeof fetch>();
  vi.stubGlobal("window", page);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => stored.set(k, v) });
  vi.stubGlobal("fetch", request);
});
afterEach(() => { watch?.stop(); watch = undefined; vi.unstubAllGlobals(); });

it("authenticates through the same-origin cookie, keeps the current clock through an outage, and clears it on sign-out", async () => {
  request.mockResolvedValueOnce(signedIn("fictional-a"))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  watch = watchWorkspaceOwner(next => observed.push(next));
  await settle();
  page.dispatchEvent(new Event("online"));
  await settle();
  page.dispatchEvent(new Event("focus"));
  await settle();
  expect(observed).toEqual([verified("fictional-a")]);
  document.dispatchEvent(new Event("visibilitychange"));
  await settle();
  expect(observed.at(-1)).toEqual({ state: "signed-out" });
  for (const [url, options] of request.mock.calls) {
    expect(url).toBe("/api/focus/owner");
    expect(options).toMatchObject({ credentials: "same-origin", cache: "no-store", redirect: "error" });
  }
  expect(stored.size).toBe(0);
});

it("requires verification on a cold offline visit or malformed reply, then resolves on retry", async () => {
  request.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({ owner: 123 }))
    .mockResolvedValueOnce(signedIn("fictional-b"));
  watch = watchWorkspaceOwner(next => observed.push(next));
  await settle();
  await watch.refresh();
  expect(observed).toEqual([{ state: "unavailable" }]);
  await watch.refresh();
  expect(observed.at(-1)).toEqual(verified("fictional-b"));
});

it("clears A immediately when a sign-in change is announced and rejects an older A response after B", async () => {
  let stale!: (response: Response) => void;
  request.mockResolvedValueOnce(signedIn("fictional-a"))
    .mockImplementationOnce(() => new Promise(resolve => { stale = resolve; }))
    .mockResolvedValueOnce(signedIn("fictional-b"));
  watch = watchWorkspaceOwner(next => observed.push(next));
  await settle();
  const earlier = watch.refresh();
  announceAccountChange();
  expect(observed.at(-1)).toEqual({ state: "loading" });
  expect([...stored.keys()]).toEqual(["grove:account-changed"]);
  expect([...stored.values()][0]).not.toMatch(/fictional/);
  await settle();
  stale(signedIn("fictional-a"));
  await earlier;
  expect(observed).toEqual([verified("fictional-a"), { state: "loading" }, verified("fictional-b")]);
});

it("forgets a previous identity on a cross-tab change or cached-page restore before reconnecting", async () => {
  request.mockResolvedValueOnce(signedIn("fictional-a"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(signedIn("fictional-b"))
    .mockRejectedValueOnce(new Error("offline"));
  watch = watchWorkspaceOwner(next => observed.push(next));
  await settle();
  page.dispatchEvent(Object.assign(new Event("storage"), { key: "grove:account-changed" }));
  await settle();
  expect(observed.slice(-2)).toEqual([{ state: "loading" }, { state: "unavailable" }]);
  await watch.refresh();
  page.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  await settle();
  expect(observed.slice(-3)).toEqual([verified("fictional-b"), { state: "loading" }, { state: "unavailable" }]);
});

it("ignores delayed identity responses and stops verifying after unmount", async () => {
  let delayed!: (response: Response) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { delayed = resolve; }));
  watch = watchWorkspaceOwner(next => observed.push(next));
  watch.stop();
  delayed(signedIn("fictional-a"));
  page.dispatchEvent(new Event("online"));
  await settle();
  expect(observed).toEqual([]);
  expect(request).toHaveBeenCalledTimes(1);
});
