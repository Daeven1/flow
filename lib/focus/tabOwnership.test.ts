import { afterEach, expect, it, vi } from "vitest";
import { joinFocusTabs } from "./tabOwnership";

// The test controls when the browser grants each queued Web Lock. Each page
// has its own visibility/events and they communicate over real BroadcastChannels.
function windows() {
  const requests: { signal: AbortSignal; enter: () => Promise<void> }[] = [];
  vi.stubGlobal("navigator", { locks: {
    request(_name: string, { signal }: { signal: AbortSignal }, callback: () => Promise<void>) {
      return new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("withdrawn")), { once: true });
        requests.push({ signal, enter: async () => { await callback(); resolve(); } });
      });
    },
  } });
  function open() {
    const page = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", page);
    vi.stubGlobal("document", doc);
    let release: (() => void) | undefined;
    const grant = vi.fn((unlock: () => void) => { release = unlock; });
    const yieldControl = vi.fn(() => release?.());
    const tab = joinFocusTabs("fixture-account", grant, yieldControl);
    return { page, doc, tab, grant, yieldControl };
  }
  return { requests, open };
}

afterEach(() => vi.unstubAllGlobals());

it("a follower leaving the page withdraws without running or saving a controller", async () => {
  const { requests, open } = windows();
  const first = open(); const firstTurn = requests[0].enter();
  const second = open();
  try {
    second.page.dispatchEvent(new Event("pagehide"));
    expect(requests[1].signal.aborted).toBe(true);
    expect(second.grant).not.toHaveBeenCalled();
    expect(second.yieldControl).not.toHaveBeenCalled();
    expect(first.yieldControl).not.toHaveBeenCalled();
  } finally { second.tab.leave(); first.tab.leave(); await firstTurn; }
});

it("a visible peer receives control when the writer is backgrounded", async () => {
  const { requests, open } = windows();
  const first = open(); const firstTurn = requests[0].enter();
  const second = open();
  try {
    first.doc.visibilityState = "hidden";
    first.doc.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(first.yieldControl).toHaveBeenCalled());
    await firstTurn;
    const secondTurn = requests[1].enter();
    expect(second.grant).toHaveBeenCalledOnce();
    second.tab.leave();
    await secondTurn;
  } finally { first.tab.leave(); second.tab.leave(); }
});
