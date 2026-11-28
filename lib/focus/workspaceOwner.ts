export type WorkspaceOwner = { state: "verified"; id: string } |
  { state: "loading" | "unavailable" | "signed-out" };

const changed = "grove:account-changed";

/** The marker carries no identity. Each open workspace checks its own same-origin cookie. */
export function announceAccountChange() {
  try { localStorage.setItem(changed, `${Date.now()}-${Math.random()}`); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new Event(changed));
}

/** Only the current document's last confirmed owner can continue its clock through an outage. */
export function watchWorkspaceOwner(publish: (next: WorkspaceOwner) => void) {
  let current: WorkspaceOwner = { state: "loading" };
  let pending: AbortController | null = null;

  function update(next: WorkspaceOwner) {
    if (next.state === current.state && (next.state !== "verified" || current.state === "verified" && current.id === next.id)) return;
    current = next;
    publish(next);
  }

  async function refresh() {
    pending?.abort();
    const request = new AbortController();
    pending = request;
    try {
      const response = await fetch("/api/focus/owner", {
        credentials: "same-origin", cache: "no-store", redirect: "error", signal: request.signal,
      });
      if (request.signal.aborted) return;
      if (response.status === 401) {
        update({ state: "signed-out" });
        return;
      }
      if (!response.ok) throw new Error("Account verification unavailable");
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("owner" in data) || typeof data.owner !== "string" || !data.owner) {
        throw new Error("Invalid account response");
      }
      if (!request.signal.aborted) update({ state: "verified", id: data.owner });
    } catch {
      if (!request.signal.aborted && current.state !== "verified" && current.state !== "signed-out") update({ state: "unavailable" });
    } finally {
      if (pending === request) pending = null;
    }
  }

  function invalidate() {
    update({ state: "loading" });
    void refresh();
  }
  function storageChanged(event: StorageEvent) { if (event.key === changed) invalidate(); }
  function onVisible() { if (document.visibilityState === "visible") void refresh(); }
  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) invalidate();
    else void refresh();
  }

  window.addEventListener(changed, invalidate);
  window.addEventListener("storage", storageChanged);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", refresh);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", onVisible);
  void refresh();

  return {
    refresh,
    stop() {
      pending?.abort();
      window.removeEventListener(changed, invalidate);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
