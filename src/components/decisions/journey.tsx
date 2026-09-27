"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Option, Step, Verdict } from "./content";

/* ─────────────────────────────────────────────────────────
 * JOURNEY EXPLORER
 *
 * Steps down the left, one step's thinking on the right. Picking a step
 * swaps the panel; the marker slides to it.
 *
 *    0ms   step tapped
 *    0ms   marker slides to the new step (spring, no bounce)
 *    0ms   old panel: opacity 1 → 0, y 0 → -4
 *  ~150ms  new panel: opacity 0 → 1, y 6 → 0, blur 4px → 0
 * ───────────────────────────────────────────────────────── */

const MARKER = { spring: { type: "spring", duration: 0.35, bounce: 0 } as const };

const PANEL = {
  enterY: 6,
  exitY: -4,
  blur: 4,
  spring: { type: "spring", duration: 0.35, bounce: 0 } as const,
};

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  chosen: { label: "Chosen", tone: "bg-ink text-white" },
  dropped: { label: "Built, then dropped", tone: "bg-black/[0.06] text-ink-muted" },
  rejected: { label: "Rejected", tone: "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] text-ink-muted" },
};

export function Journey({ steps }: { steps: Step[] }) {
  const [activeId, setActiveId] = useState(steps[0].id);
  const active = steps.find((step) => step.id === activeId) ?? steps[0];

  return (
    <div className="grid gap-10 md:grid-cols-[240px_1fr]">
      <nav aria-label="Onboarding steps" className="md:sticky md:top-24 md:self-start">
        <ol className="flex flex-col gap-0.5">
          {steps.map((step) => {
            const current = step.id === activeId;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(step.id)}
                  aria-current={current ? "step" : undefined}
                  className="relative flex w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-black/[0.03]"
                >
                  {current ? (
                    <motion.span
                      layoutId="journey-marker"
                      transition={MARKER.spring}
                      className="absolute inset-0 rounded-[14px] bg-well"
                    />
                  ) : null}
                  <span
                    className={`tabular relative mt-px flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-caption font-semibold transition-colors duration-150 ${
                      current ? "bg-ink text-white" : "bg-black/[0.06] text-ink-muted"
                    }`}
                  >
                    {step.number}
                  </span>
                  <span className="relative flex min-w-0 flex-col">
                    <span className={`text-subhead font-semibold ${current ? "text-ink" : "text-ink/80"}`}>{step.title}</span>
                    <span className="text-footnote text-ink-muted">{step.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={active.id}
            initial={{ opacity: 0, y: PANEL.enterY, filter: `blur(${PANEL.blur}px)` }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            exit={{ opacity: 0, y: PANEL.exitY }}
            transition={PANEL.spring}
            className="flex flex-col gap-10"
          >
            <header className="flex flex-col gap-3">
              <span className="text-footnote font-semibold uppercase tracking-[0.06em] text-ink-faint">Step {active.number}</span>
              <h3 className="text-title1 font-semibold text-ink">{active.title}</h3>
              <p className="max-w-[60ch] text-body text-ink-muted">{active.moment}</p>
            </header>

            <section className="flex flex-col gap-4">
              <h4 className="text-subhead font-semibold text-ink">If they…</h4>
              <dl className="flex flex-col divide-y divide-black/[0.06] rounded-[20px] bg-well px-5">
                {active.branches.map((branch) => (
                  <div key={branch.if} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6">
                    <dt className="text-subhead font-medium text-ink">{branch.if}</dt>
                    <dd className="text-subhead text-ink-muted">{branch.then}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="flex flex-col gap-4">
              <h4 className="text-subhead font-semibold text-ink">What we weighed</h4>
              <ul className="flex flex-col gap-3">
                {active.options.map((option) => (
                  <OptionCard key={option.title} option={option} />
                ))}
              </ul>
            </section>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  );
}

function OptionCard({ option }: { option: Option }) {
  const verdict = VERDICT[option.verdict];
  const chosen = option.verdict === "chosen";
  return (
    <li
      className={`flex flex-col gap-2 rounded-[20px] px-5 py-4 ${
        chosen ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.08)]" : "bg-well"
      }`}
    >
      <span className={`w-fit rounded-full px-2.5 py-1 text-caption font-semibold ${verdict.tone}`}>{verdict.label}</span>
      <span className="text-body font-semibold text-ink">{option.title}</span>
      <span className="text-subhead text-ink-muted">{option.reason}</span>
    </li>
  );
}
