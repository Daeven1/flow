"use client";

import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Coffee, Timer } from "lucide-react";
import { ModeProvider } from "@/components/ModeProvider";
import { Nav } from "@/components/Nav";
import { UserModeProvider } from "@/components/UserModeProvider";
import { AccountFocusStorage } from "@/lib/focus/accountStorage";
import { joinFocusTabs } from "@/lib/focus/tabOwnership";
import { watchWorkspaceOwner, type WorkspaceOwner } from "@/lib/focus/workspaceOwner";
import { formatClock, remainingMs } from "@/lib/focus/session";
import { useFocusSession, type FocusSessionApi } from "@/lib/focus/useFocusSession";

type FocusClock = Pick<FocusSessionApi, "session" | "ready" | "now">;
type Snapshot = { owner: string; focus: FocusClock; controller?: FocusSessionApi; takeControl?: () => void };
const FocusContext = createContext<Snapshot | null>(null);
export const useFocusWindow = () => useContext(FocusContext);

// A single controller judges and syncs. Other documents only present the
// stored clock until their visible Focus page receives ownership.
const SessionController = memo(function SessionController({ owner, publish }: {
  owner: string; publish: (snapshot: Snapshot) => void;
}) {
  const focus = useFocusSession(owner);
  useLayoutEffect(() => { if (focus.ready) publish({ owner, focus, controller: focus }); }, [owner, focus, publish]);
  return null;
});

function FocusFollower({ owner, publish, takeControl }: {
  owner: string; publish: (snapshot: Snapshot) => void; takeControl: () => void;
}) {
  useEffect(() => {
    const storage = new AccountFocusStorage(owner);
    let timer: number | null = null;
    function update() {
      const session = storage.readSession();
      const now = Date.now();
      publish({ owner, focus: { session, now, ready: true }, takeControl });
      const live = session && (!session.ended || (session.breakEndsAt ?? 0) > now);
      if (live && document.visibilityState !== "hidden" && timer === null) timer = window.setInterval(update, 1000);
      if ((!live || document.visibilityState === "hidden") && timer !== null) { clearInterval(timer); timer = null; }
    }
    update();
    window.addEventListener("storage", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      if (timer !== null) clearInterval(timer);
      window.removeEventListener("storage", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [owner, publish, takeControl]);
  return null;
}

const FocusTabs = memo(function FocusTabs({ owner, publish }: {
  owner: string; publish: (snapshot: Snapshot) => void;
}) {
  const path = usePathname();
  const [turn, setTurn] = useState({ writer: false, releasing: false });
  const unlock = useRef<(() => void) | null>(null);
  const tabs = useRef<ReturnType<typeof joinFocusTabs> | null>(null);
  const takeControl = useCallback(() => { tabs.current?.requestControl(); }, []);
  useEffect(() => {
    const group = joinFocusTabs(owner, release => {
      unlock.current = release;
      setTurn({ writer: true, releasing: false });
    }, () => setTurn({ writer: false, releasing: true }));
    tabs.current = group;
    return () => {
      group.leave();
      tabs.current = null;
      // React cleans up the controller (and its pending requests) before another
      // document can start from the storage it leaves behind.
      const release = unlock.current;
      if (release) queueMicrotask(release);
    };
  }, [owner]);
  useEffect(() => {
    if (turn.releasing && unlock.current) {
      unlock.current();
      unlock.current = null;
    }
  }, [turn]);
  useEffect(() => {
    if (path !== "/focus") return;
    takeControl();
    window.addEventListener("focus", takeControl);
    return () => window.removeEventListener("focus", takeControl);
  }, [path, takeControl]);
  return turn.writer
    ? <SessionController owner={owner} publish={publish} />
    : <FocusFollower owner={owner} publish={publish} takeControl={takeControl} />;
});

function SignedInWorkspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [identity, setIdentity] = useState<WorkspaceOwner>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const previousOwner = useRef<string | null>(null);
  const verifier = useRef<ReturnType<typeof watchWorkspaceOwner> | null>(null);
  const owner = identity.state === "verified" ? identity.id : null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    const watch = watchWorkspaceOwner(next => {
      const id = next.state === "verified" ? next.id : null;
      if (id !== previousOwner.current) {
        setSnapshot(null);
        if (previousOwner.current) setGeneration(value => value + 1);
        previousOwner.current = id;
      }
      setIdentity(next);
    });
    verifier.current = watch;
    return () => { watch.stop(); verifier.current = null; };
  }, []);
  return (
    <FocusContext.Provider value={snapshot?.owner === owner ? snapshot : null}>
      {owner && <FocusTabs key={owner} owner={owner} publish={setSnapshot} />}
      <UserModeProvider key={generation}>
        <ModeProvider>
          <Nav />
          <main id="main-content" tabIndex={-1} className="max-w-5xl mx-auto px-4 py-5 sm:py-8">
            <FocusReturnLink />
            {path === "/focus" && identity.state === "unavailable" ? (
              <div role="status" className="py-16 text-center">
                <p>Reconnect to Grove to open your focus session.</p>
                <button type="button" className="mt-2 min-h-11 px-3 underline" onClick={() => void verifier.current?.refresh()}>Try again</button>
              </div>
            ) : path === "/focus" && identity.state === "signed-out" ? (
              <p className="py-16 text-center"><Link className="inline-block min-h-11 px-3 py-2 underline" href="/login">Sign in to open Focus</Link></p>
            ) : children}
          </main>
        </ModeProvider>
      </UserModeProvider>
    </FocusContext.Provider>
  );
}

export function GroveWorkspace({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/login" || path.startsWith("/login/") || path === "/auth" || path.startsWith("/auth/") || path === "/grove-lab") {
    return <main id="main-content">{children}</main>;
  }
  return <SignedInWorkspace>{children}</SignedInWorkspace>;
}

function FocusReturnLink() {
  const path = usePathname();
  const focus = useFocusWindow()?.focus;
  const session = focus?.session;
  const inFocus = path === "/focus";
  const breakEnd = session?.breakEndsAt;
  const onBreak = breakEnd !== undefined && focus !== undefined && focus.now < breakEnd;
  const active = !!session && (!session.ended || onBreak);
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    if (inFocus || !session) setSeen(null);
    else if (active) setSeen(session.startedAt);
  }, [inFocus, active, session]);
  if (inFocus || !focus?.ready || !session || (!active && seen !== session.startedAt)) return null;

  const Icon = breakEnd !== undefined ? Coffee : Timer;
  const label = active ? onBreak ? "Break" : "Focus session" : breakEnd !== undefined ? "Break complete" :
    session.ended?.outcome === "COMPLETED" || session.ended?.outcome === "CLEARED" ? "Focus complete" : "Session ended";
  const clock = active ? formatClock(breakEnd !== undefined ? breakEnd - focus.now : remainingMs(session, focus.now)) : null;
  const action = active ? onBreak ? "Return to break" : "Return to Focus" : "View session";
  return (
    <Link href="/focus" className="mb-5 flex min-h-11 items-center gap-2 rounded-lg border border-emerald-900/20 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-emerald-200/25 dark:bg-[#1a322c] dark:text-emerald-50 dark:hover:bg-emerald-950 dark:focus-visible:outline-emerald-300">
      <Icon aria-hidden="true" size={16} className="shrink-0" />
      <span>{label}</span>
      {clock && <span role="timer" aria-live="off" className="font-semibold tabular-nums">{clock}<span className="sr-only"> remaining</span></span>}
      <span className="ml-auto inline-flex items-center gap-1 text-right font-semibold">{action}<ArrowRight aria-hidden="true" size={15} className="shrink-0" /></span>
    </Link>
  );
}
