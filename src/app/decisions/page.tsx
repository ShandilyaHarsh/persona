import type { Metadata } from "next";

import { CallMachine } from "@/components/decisions/call-machine";
import { AFTER_A_CALL, BRIEF, CALL_STATES, MOVES, PRINCIPLES, STEPS } from "@/components/decisions/content";
import { Journey } from "@/components/decisions/journey";
import { Reveal } from "@/components/shell/reveal";

export const metadata: Metadata = {
  title: "Assumptions & decisions · Persona",
  description: "How the onboarding was thought through - every step, every branch, and what we tried and dropped.",
};

export default function DecisionsPage() {
  return (
    <main className="relative min-h-dvh bg-paper">
      <article className="mx-auto flex max-w-[1080px] flex-col gap-28 px-6 pb-32 pt-32">
        <Reveal index={0}>
          <header className="flex max-w-[720px] flex-col gap-5">
            <span className="text-footnote font-semibold uppercase tracking-[0.06em] text-ink-faint">How we thought about it</span>
            <h1 className="text-[44px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink">
              Every step, every branch, and what we threw away.
            </h1>
            <blockquote className="border-l-2 border-line pl-4 text-body text-ink-muted">
              <span className="font-medium text-ink">The brief. </span>
              {BRIEF}
            </blockquote>
          </header>
        </Reveal>

        <Section index={1} number="01" title="What guided every call">
          <div className="grid gap-3 md:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title} className="flex flex-col gap-2 rounded-[20px] bg-well p-5">
                <span className="text-body font-semibold text-ink">{principle.title}</span>
                <span className="text-subhead text-ink-muted">{principle.body}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          index={2}
          number="02"
          title="The journey, step by step"
          lead="Pick a step to see everything a person might do there, how Persona handles it, and the options we weighed - including the ones we built and then dropped."
        >
          <Journey steps={STEPS} />
        </Section>

        <Section
          index={3}
          number="03"
          title="The call, as a state machine"
          lead="The call only ever happens on the Band. Every state, and every way out of it."
        >
          <CallMachine states={CALL_STATES} after={AFTER_A_CALL} />
        </Section>

        <Section index={4} number="04" title="Switching mid-conversation">
          <div className="grid gap-3 md:grid-cols-3">
            {MOVES.map((move) => (
              <div key={move.rule} className="flex flex-col gap-2 rounded-[20px] bg-well p-5">
                <span className="text-body font-semibold text-ink">{move.rule}</span>
                <span className="text-subhead text-ink-muted">{move.detail}</span>
              </div>
            ))}
          </div>
        </Section>
      </article>
    </main>
  );
}

function Section({
  index,
  number,
  title,
  lead,
  children,
}: {
  index: number;
  number: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal index={index}>
      <section className="flex flex-col gap-8">
        <header className="flex max-w-[720px] flex-col gap-3">
          <span className="tabular text-footnote font-semibold text-ink-faint">{number}</span>
          <h2 className="text-title1 font-semibold text-ink">{title}</h2>
          {lead ? <p className="text-body text-ink-muted">{lead}</p> : null}
        </header>
        {children}
      </section>
    </Reveal>
  );
}
