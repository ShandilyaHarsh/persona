"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useBandCall } from "@/components/band/use-band-call";
import { goHome, live, openPersonaApp } from "@/services/conductor";
import { useStore } from "@/lib/store";

import { ConsentSheet } from "./consent-sheet";
import { HomeScreen } from "./home-screen";
import { PersonaApp } from "./persona-app";
import { PersonaIcon } from "./persona-icon";
import { StatusBar } from "./status-bar";

// The phone is drawn at iPhone point size and scaled as a whole, so every
// radius and type size stays in proportion at any window height.
const DEVICE = { width: 390, height: 844, bezel: 12 };
const OUTER = { width: DEVICE.width + DEVICE.bezel * 2, height: DEVICE.height + DEVICE.bezel * 2 };
const SCREEN_RADIUS = 50;
const FIT_MARGIN_PX = 32; // room left around the device inside its column

export function Phone() {
  const { phoneScreen, consentFor } = useStore(live);
  const frameRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(frameRef);
  const dark = phoneScreen === "persona";

  return (
    // The top padding reserves the fixed top bar's height, so the fitted phone
    // never slides under it; padding is outside what the resize observer measures.
    <div ref={frameRef} className="flex size-full items-center justify-center pb-6 pt-19">
      <div
        className="relative shrink-0 rounded-[62px] bg-[#0b0b0c] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.9),inset_0_0_0_2px_rgba(255,255,255,0.08)]"
        style={{
          width: OUTER.width,
          height: OUTER.height,
          padding: DEVICE.bezel,
          // zoom re-lays the device out at the fitted size, so glyphs are
          // rasterized sharp; a scale transform would resample them soft.
          zoom: scale,
        }}
      >
        <div
          className="relative size-full overflow-hidden bg-white"
          style={{ borderRadius: SCREEN_RADIUS }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {phoneScreen === "home" ? (
              <Screen key="home" from={0.94}>
                <HomeScreen />
              </Screen>
            ) : (
              <Screen key="persona" from={1.04}>
                <PersonaApp />
              </Screen>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {consentFor ? (
              <motion.div
                key="consent"
                className="absolute inset-0 z-40"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", duration: 0.5, bounce: 0 }}
              >
                <ConsentSheet cardId={consentFor} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <StatusBar dark={dark} />
          <DynamicIsland />
          <Banner />
          <HomeIndicator dark={dark} onHome={phoneScreen !== "home" && !consentFor ? goHome : undefined} />
        </div>
      </div>
    </div>
  );
}

function Screen({ children, from }: { children: ReactNode; from: number }) {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: from }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
    >
      {children}
    </motion.div>
  );
}

/** A call on the band shows on the phone the way a live activity would. */
function DynamicIsland() {
  const { speaking } = useStore(live);
  const call = useBandCall();
  const band = call !== null;
  return (
    <motion.div
      className="absolute left-1/2 top-[11px] z-50 flex -translate-x-1/2 items-center justify-between overflow-hidden rounded-full bg-black px-3"
      // A compact live activity: just wide enough for a glyph each side, so it
      // sits between the clock and the status icons instead of over them.
      animate={{ width: band ? 176 : 124, height: 36 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
    >
      <AnimatePresence>
        {band ? (
          <motion.div
            className="flex w-full items-center justify-between"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.2 }}
          >
            <span
              className="size-3.5 rounded-full border-2 border-white/90"
              aria-label="On a call on your band"
            />
            <span className="flex h-3 items-center gap-0.5" aria-hidden>
              {[0.5, 1, 0.7, 0.4].map((height, index) => (
                <span
                  key={index}
                  className="w-[2.5px] rounded-full bg-positive"
                  style={{
                    height: `${height * 100}%`,
                    opacity: call === "connecting" ? 0.35 : 1,
                    animation: speaking ? `typing-dot 0.9s ${index * 0.12}s infinite ease-in-out` : undefined,
                  }}
                />
              ))}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function Banner() {
  const { banner } = useStore(live);
  return (
    <AnimatePresence>
      {banner ? (
        <motion.button
          key={banner.id}
          type="button"
          onClick={openPersonaApp}
          className="absolute inset-x-2.5 top-[54px] z-50 flex items-start gap-3 rounded-[22px] bg-white/80 p-3 text-left shadow-[0_8px_32px_rgba(0,0,0,0.14),0_0_0_0.5px_rgba(0,0,0,0.06)] backdrop-blur-xl active:scale-[0.98] transition-transform"
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
        >
          <PersonaIcon size={38} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between">
              <span className="text-subhead font-semibold text-ink">{banner.title}</span>
              <span className="text-caption text-ink-faint">now</span>
            </span>
            <span className="line-clamp-2 text-subhead text-ink">{banner.body}</span>
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

function HomeIndicator({ dark, onHome }: { dark: boolean; onHome?: () => void }) {
  return (
    <button
      type="button"
      onClick={onHome}
      disabled={!onHome}
      aria-label="Go to home screen"
      className="absolute bottom-0 left-1/2 z-50 flex h-8 w-48 -translate-x-1/2 items-center justify-center"
    >
      <span className={`h-[5px] w-36 rounded-full ${dark ? "bg-white/80" : "bg-black/85"}`} />
    </button>
  );
}

/** Scale the device to fit its column, never above life size. */
function useFitScale(ref: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(1, (height - FIT_MARGIN_PX) / OUTER.height, (width - FIT_MARGIN_PX) / OUTER.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
}
