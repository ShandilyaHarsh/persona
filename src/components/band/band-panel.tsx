"use client";

import { AnimatePresence, motion } from "motion/react";

import { usePersonaName } from "@/components/use-persona-name";
import { live } from "@/services/conductor";
import { useStore } from "@/lib/store";

import { Band } from "./band";
import { useBandCall } from "./use-band-call";

export function BandPanel() {
  const { caption, bandNotice, ringing, buzz } = useStore(live);
  const name = usePersonaName();
  const call = useBandCall();

  const line =
    bandNotice ??
    (buzz
      ? `Reminder: ${buzz.task}`
      : ringing === "user"
        ? "Press to start the call"
        : ringing
          ? `${name} is calling`
          : call === "connecting"
            ? "Connecting…"
            : call === "live"
              ? (caption?.text ?? "Listening…")
              : "Press the ring to talk");
  const hint = buzz
    ? "Press to dismiss"
    : ringing === "user"
      ? "Continuing from the app · press twice to cancel"
      : ringing
        ? "Press to answer · press twice to decline"
        : call === "connecting"
          ? "Press to cancel"
          : call === "live"
            ? "Press to end the call"
            : " ";

  return (
    <div className="flex size-full flex-col items-center px-8 pb-8 pt-16">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <Band />
      </div>

      <div className="flex w-full max-w-[420px] flex-col items-center gap-1 text-center">
        <div aria-live="polite" className="flex min-h-12 items-end justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className={`line-clamp-2 text-body ${
                caption?.role === "user" && call === "live" && !bandNotice ? "text-ink-muted" : "text-ink"
              }`}
            >
              {line}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="text-footnote text-ink-faint">{hint}</p>
      </div>
    </div>
  );
}
