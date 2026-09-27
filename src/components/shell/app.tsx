"use client";

import { BandPanel } from "@/components/band/band-panel";
import { Phone } from "@/components/phone/phone";
import { hydrate, reset } from "@/services/conductor";

// Browser-only (see page.tsx), so this runs exactly once, before first render.
hydrate();

export default function App() {
  return (
    <>
      <section aria-label="Persona Band" className="min-h-0">
        <BandPanel />
      </section>
      <section aria-label="Phone" className="min-h-0">
        <Phone />
      </section>
      {/* On the seam between the two devices, belonging to neither. */}
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Start over? This clears everything Persona has learned.")) reset();
        }}
        className="absolute left-1/2 top-1/2 min-h-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-4 text-footnote text-ink-faint transition-colors duration-150 hover:bg-well hover:text-ink"
      >
        Reset onboarding
      </button>
    </>
  );
}
