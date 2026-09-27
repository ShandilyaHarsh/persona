"use client";

import { useEffect, useState } from "react";

/**
 * The current time, ticking. Null until mounted so the server render and the
 * first client render agree.
 */
export function useClock(intervalMs = 1_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The time as the phone shows it: "9:41", with no AM/PM. */
export function clockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "");
}
