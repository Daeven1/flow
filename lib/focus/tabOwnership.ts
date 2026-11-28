"use client";

/** One visible document owns the timer. Other documents wait on the same lock
 * and display the last saved state. The active Focus window can request a turn. */
export function joinFocusTabs(owner: string, grant: (release: () => void) => void, yieldControl: () => void) {
  const name = `grove:focus:${owner}`;
  const page = window;
  const doc = document;
  const locks = navigator.locks;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
  let visible = doc.visibilityState !== "hidden";
  let closed = false;
  let pending: AbortController | null = null;
  let held = false;
  let requested = false;
  const requestKey = `${name}:request`;
  function announce(message: string) {
    if (channel) channel.postMessage(message);
    else {
      try { localStorage.setItem(requestKey, JSON.stringify([message, Math.random()])); } catch { /* one tab only */ }
    }
  }
  const available = () => !closed && visible;

  // Mobile browsers on a plain HTTP LAN have no Web Locks. A storage lease
  // gives the focused document control and expires if that document disappears.
  const token = `${Date.now()}-${Math.random()}`;
  const leaseKey = `${name}:writer`;
  let inaccessible = false;
  const readLease = (): { token: string; until: number } | null => {
    try { return JSON.parse(localStorage.getItem(leaseKey) ?? "null"); } catch { inaccessible = true; return null; }
  };
  const writeLease = () => {
    try { localStorage.setItem(leaseKey, JSON.stringify({ token, until: Date.now() + 10_000 })); }
    catch { inaccessible = true; }
  };
  const checkLease = () => {
    if (!available()) return;
    const lease = readLease();
    if (held) {
      if (lease && lease.token !== token) yieldControl();
      else writeLease();
      return;
    }
    if (lease && lease.token !== token && lease.until > Date.now()) return;
    writeLease();
    if (!inaccessible && readLease()?.token !== token) return;
    held = true;
    requested = false;
    announce("owner");
    grant(() => {
      held = false;
      if (readLease()?.token === token) {
        try { localStorage.removeItem(leaseKey); } catch { /* storage unavailable */ }
      }
    });
  };

  function waitForTurn() {
    if (!available() || held || pending) return;
    if (!locks) { checkLease(); return; }
    const attempt = new AbortController();
    pending = attempt;
    void locks.request(name, { signal: attempt.signal }, async () => {
      if (!available()) return;
      pending = null;
      held = true;
      requested = false;
      announce("owner");
      await new Promise<void>(release => grant(release));
      held = false;
    }).catch(() => { /* An invisible or unmounted waiter withdraws. */ }).finally(() => {
      if (pending === attempt) pending = null;
      if (available()) waitForTurn();
    });
  }

  function requestControl() {
    if (!available() || held) return;
    requested = true;
    waitForTurn();
    if (!held) announce("request");
  }
  function receive(message: unknown) {
    if (held && (message === "request" || (message === "visible" && !visible))) yieldControl();
    if (message === "hidden" && available() && !held) announce("visible");
    if (message === "owner" && requested && !held && available()) announce("request");
    if (message === "time-saved" && !held) page.dispatchEvent(new Event("grove:focus-time-saved"));
  }
  const onRequest = (event: MessageEvent) => receive(event.data);
  const timeSaved = () => { if (held) announce("time-saved"); };
  page.addEventListener("grove:focus-time-saved", timeSaved);
  function show() {
    visible = doc.visibilityState !== "hidden";
    if (visible) {
      waitForTurn();
      if (!held) announce("visible");
    } else {
      requested = false;
      pending?.abort();
      // A single backgrounded document keeps its mounted timer and setup.
      // A visible peer responds and picks up the writer before Strict expires.
      if (held) announce("hidden");
    }
  }
  function hide() {
    visible = false;
    requested = false;
    pending?.abort();
    if (held) yieldControl();
  }
  function onStorage(event: StorageEvent) {
    if (!locks && event.key === leaseKey) checkLease();
    if (event.key === requestKey && event.newValue) {
      try { receive(JSON.parse(event.newValue)[0]); } catch { /* invalid message */ }
    }
  }
  channel?.addEventListener("message", onRequest);
  doc.addEventListener("visibilitychange", show);
  page.addEventListener("pagehide", hide);
  page.addEventListener("pageshow", show);
  if (!locks || !channel) page.addEventListener("storage", onStorage);
  const leaseTimer = !locks ? page.setInterval(checkLease, 3000) : null;
  show();
  return {
    requestControl,
    leave() {
      closed = true;
      hide();
      channel?.close();
      doc.removeEventListener("visibilitychange", show);
      page.removeEventListener("pagehide", hide);
      page.removeEventListener("pageshow", show);
      page.removeEventListener("storage", onStorage);
      page.removeEventListener("grove:focus-time-saved", timeSaved);
      if (leaseTimer !== null) clearInterval(leaseTimer);
    },
  };
}
