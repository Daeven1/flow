"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { format, startOfDay } from "date-fns";

export type Mode = "PROFESSIONAL" | "PERSONAL";

interface ModeContextValue {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function useModeContext(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useModeContext must be used inside ModeProvider");
  return ctx;
}

function weekdayDefault(): Mode {
  const day = new Date().getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6 ? "PERSONAL" : "PROFESSIONAL";
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");

  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return "PROFESSIONAL";
    const storedDate = localStorage.getItem("grove-mode-date");
    if (storedDate === todayStr) {
      const stored = localStorage.getItem("grove-mode") as Mode | null;
      if (stored === "PROFESSIONAL" || stored === "PERSONAL") return stored;
    }
    return weekdayDefault();
  });

  useEffect(() => {
    document.documentElement.classList.toggle("personal-mode", mode === "PERSONAL");
    localStorage.setItem("grove-mode", mode);
    localStorage.setItem("grove-mode-date", todayStr);
  }, [mode, todayStr]);

  function setMode(m: Mode) {
    setModeState(m);
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}
