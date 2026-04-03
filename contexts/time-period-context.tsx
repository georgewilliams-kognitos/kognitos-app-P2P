"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TimePeriod } from "@/lib/dashboard-time-period";

type TimePeriodContextValue = {
  timePeriod: TimePeriod;
  setTimePeriod: React.Dispatch<React.SetStateAction<TimePeriod>>;
};

const TimePeriodContext = createContext<TimePeriodContextValue | null>(null);

export function TimePeriodProvider({ children }: { children: ReactNode }) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all_time");
  const value = useMemo(
    () => ({ timePeriod, setTimePeriod }),
    [timePeriod],
  );
  return (
    <TimePeriodContext.Provider value={value}>
      {children}
    </TimePeriodContext.Provider>
  );
}

export function useSharedTimePeriod(): TimePeriodContextValue {
  const ctx = useContext(TimePeriodContext);
  if (!ctx) {
    throw new Error(
      "useSharedTimePeriod must be used within TimePeriodProvider",
    );
  }
  return ctx;
}
