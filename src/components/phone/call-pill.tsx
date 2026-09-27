"use client";

import { AnimatePresence, motion } from "motion/react";

import { useBandCall } from "@/components/band/use-band-call";
import { cancelRing, live } from "@/services/conductor";
import { useStore } from "@/lib/store";

/**
 * What the band is doing, seen from the app: ringing, on a call, or buzzing
 * with a reminder. Status only - the band is where you answer, and the app
 * stays for messaging.
 */
export function CallPill() {
  const { ringing, buzz } = useStore(live);
  const call = useBandCall();
  const line = buzz
    ? `Reminder on your band · ${buzz.task}`
    : ringing === "user"
      ? "Press your band to start the call"
      : ringing
        ? "Your band is ringing · press it to answer"
        : call === "connecting"
          ? "Connecting your band…"
          : call === "live"
            ? "On a call on your band"
            : null;

  return (
    <AnimatePresence initial={false}>
      {line ? (
        <motion.div
          key={line}
          role="status"
          className="flex max-w-[92%] items-center gap-2 rounded-full bg-white/12 px-3 py-2 text-footnote text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] backdrop-blur-xl"
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        >
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-positive opacity-60" />
            <span className="relative size-2 rounded-full bg-positive" />
          </span>
          <span className="truncate">{line}</span>
          {ringing === "user" && !buzz ? (
            <button
              type="button"
              onClick={cancelRing}
              className="-my-1 -mr-1.5 min-h-7 shrink-0 rounded-full bg-white/15 px-2.5 text-footnote font-medium transition-transform duration-150 active:scale-[0.96]"
            >
              Cancel
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
