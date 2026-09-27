"use client";

import { useEffect, useRef } from "react";

import { voiceLevels } from "@/services/conductor";

/* ─────────────────────────────────────────────────────────
 * PRESENCE RING
 *
 * The one visual that means "Persona is here", laid over the band's face.
 * Sized entirely by its parent.
 *
 *   idle         a faint groove
 *   connecting   an arc of light runs around it
 *   listening    fully lit; glow breathes with the user's voice
 *   speaking     glow swells with the assistant's voice
 *   pulse        while a conversation is live, a soft wave rolls outward
 *                every 1.8s - "I'm with you" at a glance, even in silence
 *
 * Put it inside an element with the `group` class to get the hover lift.
 * ───────────────────────────────────────────────────────── */

type RingState = "idle" | "connecting" | "live";

const STROKE = 6.3; // % of the ring's width

const GLOW = {
  listeningBase: 0.55,
  listeningGain: 0.45,
  speakingBase: 0.7,
  speakingGain: 0.3,
  haloBase: 0.25,
  haloGain: 0.75,
  speakingScale: 0.04,
};

export function PresenceRing({
  state,
  speaking,
  pulse,
}: {
  state: RingState;
  speaking: boolean;
  pulse: boolean;
}) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const lit = state === "live";

  // Levels change sixty times a second; React doesn't need to hear about it.
  useEffect(() => {
    if (!lit) return;
    let frame = 0;
    const tick = () => {
      const { input, output } = voiceLevels();
      const level = speaking ? output : input;
      const ring = ringRef.current;
      const halo = haloRef.current;
      if (ring) {
        const base = speaking ? GLOW.speakingBase : GLOW.listeningBase;
        const gain = speaking ? GLOW.speakingGain : GLOW.listeningGain;
        ring.style.opacity = String(Math.min(1, base + level * gain));
      }
      if (halo) {
        halo.style.opacity = String(Math.min(1, GLOW.haloBase + level * GLOW.haloGain));
        halo.style.scale = String(1 + (speaking ? level * GLOW.speakingScale : 0));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const ring = ringRef.current;
    const halo = haloRef.current;
    return () => {
      cancelAnimationFrame(frame);
      if (ring) ring.style.opacity = "";
      if (halo) {
        halo.style.opacity = "";
        halo.style.scale = "";
      }
    };
  }, [lit, speaking]);

  return (
    <span className="relative block size-full rounded-full [container-type:inline-size]">
      {/* Halo: light spilling onto whatever the ring sits in. */}
      <span
        ref={haloRef}
        aria-hidden
        className="absolute inset-0 rounded-full transition-opacity duration-300 ease-out-soft"
        style={{
          opacity: lit ? GLOW.haloBase : 0,
          boxShadow: "0 0 11cqw 3cqw rgba(255,255,255,0.28), inset 0 0 9cqw 2cqw rgba(255,255,255,0.14)",
        }}
      />
      {/* Unlit: a groove. */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border-solid border-white/40 transition-[border-color] duration-200 ease-out-soft group-hover:border-white/65 group-active:border-white/80"
        style={{
          borderWidth: `${STROKE}cqw`,
          boxShadow: "inset 0 1px 1px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)",
        }}
      />
      {/* Lit: the light itself. */}
      <span
        ref={ringRef}
        aria-hidden
        className="absolute inset-0 rounded-full border-solid border-white transition-opacity duration-300 ease-out-soft"
        style={{
          opacity: lit ? GLOW.listeningBase : 0,
          borderWidth: `${STROKE}cqw`,
          boxShadow: "0 0 3cqw rgba(255,255,255,0.9), inset 0 0 3cqw rgba(255,255,255,0.7)",
        }}
      />
      {pulse
        ? [0, 0.9].map((delay) => (
            <span
              key={delay}
              aria-hidden
              className="absolute inset-0 rounded-full border-solid border-white/50"
              style={{
                borderWidth: `${STROKE * 0.6}cqw`,
                animation: `ring-pulse 1.8s ${delay}s cubic-bezier(0.2, 0, 0, 1) infinite`,
              }}
            />
          ))
        : null}
      {state === "connecting" ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.95) 80deg, transparent 120deg)",
            mask: `radial-gradient(circle closest-side, transparent calc(100% - ${STROKE}cqw), #000 calc(100% - ${STROKE}cqw + 0.5px))`,
            animation: "ring-spin 1.1s linear infinite",
            filter: "drop-shadow(0 0 2cqw rgba(255,255,255,0.8))",
          }}
        />
      ) : null}
    </span>
  );
}
