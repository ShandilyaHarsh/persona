"use client";

import { BatteryIcon, SignalIcon, WifiIcon } from "@/components/icons";

import { clockTime, useClock } from "./use-clock";

export function StatusBar({ dark }: { dark: boolean }) {
  const now = useClock();
  const tone = dark ? "text-white" : "text-ink";
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-40 flex h-[54px] items-center justify-between px-[34px] pt-1 transition-colors duration-300 ${tone}`}
    >
      <span className="tabular w-14 text-center text-body font-semibold">{now ? clockTime(now) : null}</span>
      <span className="flex items-center gap-1.5">
        <SignalIcon />
        <WifiIcon />
        <BatteryIcon />
      </span>
    </div>
  );
}
