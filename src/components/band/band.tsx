"use client";

import { useRef } from "react";

import { usePersonaName } from "@/components/use-persona-name";
import { bandDoublePress, bandPress, live } from "@/services/conductor";
import { useStore } from "@/lib/store";

import { PresenceRing } from "./presence-ring";
import { useBandCall } from "./use-band-call";

/* ─────────────────────────────────────────────────────────
 * THE BAND, ON A WRIST
 *
 * A studio photograph of a wrist wearing the band, with the ring laid over
 * the band's face as a real control: it presses, lights, and pulses for as
 * long as a call is ringing or on.
 *
 *   press        ring sinks into the fabric (scale 0.96)
 *   ringing      a call is waiting: three quick vibrations, ring lit
 *   buzz         a reminder is due: the same vibration
 *   one press    dismiss a buzz, answer a ringing call, end the call, or start one
 *   two presses  decline a ringing call
 * ───────────────────────────────────────────────────────── */

// /wrist.webp is exported at 1400 × 2100 from a 2336 × 3504 render; the band's
// face was measured on the original: x 768-1668, y 1496-1844.
const PHOTO = { width: 2336, height: 3504 };
const FACE = { left: 768, right: 1668, top: 1496, bottom: 1844 };
const RING_OF_FACE = 0.6; // ring diameter as a share of the face's height

const RING = {
  cx: (FACE.left + FACE.right) / 2,
  cy: (FACE.top + FACE.bottom) / 2,
  diameter: (FACE.bottom - FACE.top) * RING_OF_FACE,
};

const DOUBLE_PRESS_MS = 280;

const pct = (value: number, of: number) => `${(value / of) * 100}%`;
const cqw = (value: number) => `${(value / PHOTO.width) * 100}cqw`;

export function Band() {
  const { speaking, ringing, buzz } = useStore(live);
  const name = usePersonaName();
  const status = useBandCall();
  // Ringing lights the ring before anyone is on the line - that's the ring.
  const alerting = ringing !== null || buzz !== null;
  const ring = status ?? (alerting ? "live" : "idle");
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function press() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      bandDoublePress();
      return;
    }
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      bandPress();
    }, DOUBLE_PRESS_MS);
  }

  return (
    <div
      className="relative h-full max-h-[780px] [container-type:inline-size]"
      // A call or a reminder buzzes the whole wrist - three quick pulses, then
      // a rest - the way a haptic would.
      style={{
        aspectRatio: `${PHOTO.width} / ${PHOTO.height}`,
        animation: alerting ? "band-buzz 0.9s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite" : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local photo the ring is measured against */}
      <img
        src="/wrist.webp"
        alt="A wrist wearing the Persona Band"
        draggable={false}
        // Multiply melts the photo's near-white studio backdrop into the page,
        // and the mask feathers all four edges so the frame never shows; the
        // arm simply fades out at the top and bottom.
        className="absolute inset-0 size-full select-none object-contain mix-blend-multiply [mask-composite:intersect] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_12%,#000_80%,transparent_100%),linear-gradient(to_right,transparent_0%,#000_14%,#000_86%,transparent_100%)]"
      />

      <button
        type="button"
        onClick={press}
        aria-label={
          buzz
            ? `Reminder: ${buzz.task}. Press to dismiss`
            : ringing
              ? "Press to answer, press twice to decline"
              : status === "connecting"
                ? "Connecting. Press to cancel"
                : status === "live"
                  ? "Press to end the call"
                  : `Press to call ${name}`
        }
        className="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none"
        style={{
          left: pct(RING.cx, PHOTO.width),
          top: pct(RING.cy, PHOTO.height),
          // The hit area reaches past the ring: it is a small target on a wrist.
          width: cqw(RING.diameter * 1.6),
          height: cqw(RING.diameter * 1.6),
        }}
      >
        <span
          className="block rounded-full transition-[scale] duration-150 ease-out-soft group-active:scale-[0.96] group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-imessage/70"
          style={{ width: cqw(RING.diameter), height: cqw(RING.diameter) }}
        >
          <PresenceRing state={ring} speaking={speaking} pulse={status === "live" || alerting} />
        </span>
      </button>
    </div>
  );
}
