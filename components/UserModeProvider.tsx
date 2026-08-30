"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UserMode = "TEACHER" | "STUDENT";

interface UserModeContextValue {
  userMode: UserMode;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserModeContext = createContext<UserModeContextValue | null>(null);

export function useUserMode(): UserModeContextValue {
  const ctx = useContext(UserModeContext);
  if (!ctx) throw new Error("useUserMode must be used inside UserModeProvider");
  return ctx;
}

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [userMode, setUserMode] = useState<UserMode>("TEACHER");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setUserMode(data.userMode === "STUDENT" ? "STUDENT" : "TEACHER");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UserModeContext.Provider value={{ userMode, loading, refresh }}>
      {children}
    </UserModeContext.Provider>
  );
}
