"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarDays,
  FolderKanban,
  CheckSquare,
  Layers,
  Clock,
  BarChart2,
  Settings,
  LayoutTemplate,
  Crosshair,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/sprints", label: "Sprints", icon: Layers },
  { href: "/focus", label: "Focus", icon: Crosshair },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/review", label: "Review", icon: BarChart2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [userInitial, setUserInitial] = useState<string>("?");
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isDark =
      localStorage.getItem("flow-theme") === "dark" ||
      (!localStorage.getItem("flow-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserInitial(user.email[0].toUpperCase());
      else if (user?.user_metadata?.name)
        setUserInitial(user.user_metadata.name[0].toUpperCase());
    });
  }, []);

  // Close avatar menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("flow-theme", next ? "dark" : "light");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="flex items-center gap-1 px-4 h-[52px] bg-slate-900 dark:bg-zinc-900 border-b border-slate-800 dark:border-zinc-800 overflow-x-auto shrink-0">
      {/* Brand */}
      <span className="text-xs font-black tracking-[0.2em] text-white mr-5 shrink-0">
        FLOW
      </span>

      {/* Nav links */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                active
                  ? "bg-slate-700 dark:bg-zinc-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-zinc-800"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1 shrink-0 ml-2 overflow-visible">
        <button
          onClick={toggleDark}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-zinc-800 transition-colors"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Avatar + sign-out dropdown */}
        <div className="relative" ref={avatarRef}>
          <button
            onClick={() => setAvatarOpen((o) => !o)}
            className="w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-400 flex items-center justify-center text-xs font-bold text-white transition-colors"
          >
            {userInitial}
          </button>

          {avatarOpen && (
            <div className="fixed right-4 top-[52px] w-44 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-[9999]">
              <Link
                href="/settings"
                onClick={() => setAvatarOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 w-full text-left"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
