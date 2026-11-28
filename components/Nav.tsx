"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart2, Bookmark, BriefcaseBusiness, CalendarDays, CheckSquare, ChevronDown,
  Clock, FolderKanban, Layers, LayoutTemplate, Leaf, LogOut, Moon, Settings,
  Sprout, Timer, UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { accountEmail, signOutOfGrove } from "@/app/auth/actions";
import { useModeContext } from "./ModeProvider";
import { useUserMode } from "./UserModeProvider";

const PRIMARY = [
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
];

const PROJECTS = { href: "/projects", label: "Projects", icon: FolderKanban };
const MORE: { href: string; label: string; icon: typeof CalendarDays; teacherOnly?: boolean }[] = [
  PROJECTS,
  { href: "/sprints", label: "Sprints", icon: Layers, teacherOnly: true },
  { href: "/time", label: "Time log", icon: Clock },
  { href: "/review", label: "Review", icon: BarChart2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate, teacherOnly: true },
  { href: "/lists", label: "Lists", icon: Bookmark },
];

const focusRing = "focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300";
const tab = `flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold transition-colors sm:px-2 lg:px-2.5 ${focusRing}`;
const currentTab = "bg-white/[0.14] text-white";
const currentMarker = "relative after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-emerald-200";
const idleTab = "text-slate-300 hover:bg-white/[0.08] hover:text-white";
const panel = "absolute right-0 top-full z-50 mt-1 max-h-[60dvh] w-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const panelRow = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-slate-100 focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800 dark:focus-visible:outline-emerald-300";

type Panel = "more" | "account";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode } = useModeContext();
  const { userMode, loading } = useUserMode();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState<Panel | null>(null);
  const [userInitial, setUserInitial] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const theme = localStorage.getItem("grove-theme");
    const isDark = theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    if (pathname === "/login") return;
    accountEmail().then(email => {
      if (email) setUserInitial(email.charAt(0).toUpperCase());
    }).catch(() => {});
  }, [pathname]);

  useEffect(() => { setOpen(null); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const container = open === "more" ? moreRef.current : accountRef.current;
    function dismissOutside(event: Event) {
      if (event.target instanceof Node && !container?.contains(event.target)) setOpen(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(null);
        container?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function togglePanel(next: Panel) {
    setOpen((current) => current === next ? null : next);
    setSignOutError(false);
  }

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("grove-theme", next ? "dark" : "light");
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      if (!await signOutOfGrove()) {
        setSignOutError(true);
        return;
      }
      setOpen(null);
      router.push("/login");
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreItems = MORE.filter((item) => !item.teacherOnly || (!loading && userMode === "TEACHER"));
  const currentMore = moreItems.find(({ href }) => isCurrent(href));
  const personal = mode === "PERSONAL";
  const onProjects = currentMore?.href === PROJECTS.href;
  const onSettings = isCurrent("/settings");

  return (
    <header className={cn("border-b border-black/15 text-white", personal ? "bg-[#263c2e]" : "bg-[#1b3034]")}>
      <a href="#main-content" className="sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:whitespace-normal focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-slate-900 focus:[clip:auto]">Skip to content</a>
      <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto] items-center gap-x-2 px-3 sm:px-4 md:grid-cols-[auto_1fr_auto] md:gap-x-3 md:py-1.5">
        <Link href="/daily" aria-label="Grove home" className={cn("flex min-h-11 w-fit items-center gap-2 rounded-lg pr-1", focusRing)}>
          <Sprout aria-hidden="true" size={23} className="text-emerald-200" />
          <span className="font-serif text-[25px] font-semibold leading-none tracking-tight">Grove</span>
        </Link>

        <nav aria-label="Main navigation" className="col-span-2 row-start-2 grid grid-cols-[1fr_1fr_1fr_1.25fr] gap-1 border-t border-white/10 py-1 md:col-span-1 md:col-start-2 md:row-start-1 md:flex md:border-0 md:py-0">
          {[...PRIMARY, PROJECTS].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isCurrent(href) ? "page" : undefined}
              className={cn(tab, isCurrent(href) ? [currentTab, currentMarker] : idleTab, href === PROJECTS.href && "hidden md:flex")}>
              <Icon aria-hidden="true" size={16} />{label}
            </Link>
          ))}
          <div ref={moreRef} className="relative">
            <button type="button"
              aria-expanded={open === "more"} aria-controls={open === "more" ? "grove-more-pages" : undefined}
              onClick={() => togglePanel("more")}
              className={cn(tab, "w-full", currentMore || open === "more" ? currentTab : idleTab,
                currentMore && currentMarker, onProjects && "md:after:hidden",
                onProjects && open !== "more" && "md:bg-transparent md:text-slate-300 md:hover:bg-white/[0.08] md:hover:text-white")}>
              <span className={onProjects ? "md:hidden" : undefined}>
                {currentMore?.label ?? "More"}<span className="sr-only">{currentMore ? ", more pages" : " pages"}</span>
              </span>
              {onProjects && <span className="hidden md:inline">More<span className="sr-only"> pages</span></span>}
              <ChevronDown aria-hidden="true" size={14} className={open === "more" ? "rotate-180" : ""} />
            </button>
            {open === "more" && (
              <div id="grove-more-pages" className={panel}>
                {moreItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={() => { setOpen(null); moreRef.current?.querySelector("button")?.focus(); }}
                    aria-current={isCurrent(href) ? "page" : undefined}
                    className={cn(panelRow, href === PROJECTS.href && "md:hidden", isCurrent(href) && "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100")}>
                    <Icon aria-hidden="true" size={16} />{label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="col-start-2 row-start-1 flex items-center gap-1.5 py-1 md:col-start-3 md:py-0">
          <div role="group" aria-label="Workspace" className="flex rounded-full bg-black/15 p-0.5 ring-1 ring-inset ring-white/15">
            {([["PROFESSIONAL", "Work", BriefcaseBusiness], ["PERSONAL", "Home", Leaf]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}
                className={cn("flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold sm:px-3", focusRing,
                  mode === value ? "bg-emerald-100 text-emerald-950 focus-visible:outline-emerald-800" : idleTab)}>
                <Icon aria-hidden="true" size={13} className="hidden min-[400px]:block md:hidden lg:block" />{label}
              </button>
            ))}
          </div>
          <div ref={accountRef} className="relative">
            <button type="button" aria-label="Account and appearance" aria-expanded={open === "account"}
              aria-controls={open === "account" ? "grove-account" : undefined} onClick={() => togglePanel("account")}
              className={cn("grid size-11 place-items-center rounded-full", focusRing, onSettings || open === "account" ? currentTab : idleTab)}>
              <span className="grid size-7 place-items-center rounded-full border border-white/30 bg-white/10 text-xs font-semibold text-white">
                {userInitial || <UserRound aria-hidden="true" size={15} />}
              </span>
            </button>
            {open === "account" && (
              <div id="grove-account" className={panel}>
                <Link href="/settings" aria-current={onSettings ? "page" : undefined} onClick={() => { setOpen(null); accountRef.current?.querySelector("button")?.focus(); }} className={panelRow}>
                  <Settings aria-hidden="true" size={16} />Settings
                </Link>
                <button type="button" onClick={toggleDark} aria-pressed={dark} className={panelRow}>
                  <Moon aria-hidden="true" size={16} />Dark mode
                  <span aria-hidden="true" className="ml-auto text-xs">{dark ? "On" : "Off"}</span>
                </button>
                <div className="my-1 border-t border-slate-200 dark:border-zinc-700" />
                <button type="button" disabled={signingOut} onClick={signOut} className={panelRow}>
                  <LogOut aria-hidden="true" size={16} />{signingOut ? "Signing out…" : "Sign out"}
                </button>
                {signOutError && <p role="alert" className="px-3 py-2 text-xs text-red-700 dark:text-red-300">Couldn’t sign out. Try again.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
