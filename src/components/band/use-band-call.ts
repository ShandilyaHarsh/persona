"use client";

import { live } from "@/services/conductor";
import { useStore } from "@/lib/store";

/** The call on the band, if there is one: still connecting, or live. */
export function useBandCall(): "connecting" | "live" | null {
  const { session } = useStore(live);
  return session?.surface === "band" ? session.status : null;
}
