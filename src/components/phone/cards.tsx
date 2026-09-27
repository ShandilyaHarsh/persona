"use client";

import { motion } from "motion/react";

import { BellIcon, BellRingingIcon, CheckIcon, InboxIcon, MailIcon, RingIcon, TasksIcon } from "@/components/icons";
import { completeCard, openConsent } from "@/services/conductor";
import { REMINDER_DEMO_SECONDS } from "@/domain/demo";
import type { TaskOption, ThreadItem } from "@/domain/onboarding";
import { usePersonaName } from "@/components/use-persona-name";

type CardItem = Extract<ThreadItem, { kind: "card" }>;

/** Everyday names, so the assistant feels like a person rather than a product. */
const NAMES = ["Ava", "Leo", "Maya", "Sam"];

/* ─────────────────────────────────────────────────────────
 * CARDS
 *
 * Made of the same material as the rest of the app - translucent white on
 * near-black, a hairline edge - so a card reads as part of the conversation,
 * not a panel dropped into it. The choices are the heaviest thing in a card;
 * the header is a small glyph and a line of text.
 *
 *    0ms   card fades up 6px
 *   80ms   options follow, 50ms apart
 *   tap    the answer posts as the user's own bubble; the card leaves
 *
 * One spacing system: 12 around, 12 between header and content, 6 between
 * options. Header text sits on the same inset as option text (12), and the
 * icon has a fixed 16 box so a description always lines up under the title.
 * Radii are concentric: card 24 = option 12 + padding 12.
 * ───────────────────────────────────────────────────────── */

const CARD = {
  radius: 24,
  padding: 12,
  riseY: 6, // px the card rises from as it appears
  spring: { type: "spring", duration: 0.4, bounce: 0 } as const,
};

const OPTIONS = {
  radius: 12,
  delay: 0.08, // s after the card before the first option
  stagger: 0.05, // s between options
  riseY: 4,
};

export function CardBody({ item }: { item: CardItem }) {
  switch (item.card) {
    case "name_agent":
      return <NameCard item={item} />;
    case "connect_gmail":
      return <GmailCard item={item} />;
    case "task_options":
      return <TaskOptionsCard item={item} />;
  }
}

function Shell({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: CARD.riseY }}
      animate={{ opacity: 1, y: 0 }}
      transition={CARD.spring}
      className="flex flex-col gap-3 bg-white/[0.06] text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)]"
      style={{ borderRadius: CARD.radius, padding: CARD.padding }}
    >
      <div className="flex flex-col gap-0.5 px-3">
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center text-white/55">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-subhead font-semibold text-white/90">{title}</span>
          {badge ? (
            <span className="shrink-0 text-caption2 font-semibold uppercase tracking-[0.04em] text-white/40">{badge}</span>
          ) : null}
        </div>
        {description ? <p className="pl-6 text-footnote text-white/50">{description}</p> : null}
      </div>
      {children}
    </motion.div>
  );
}

function Settled({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-3 text-footnote font-medium text-positive">
      <CheckIcon size={15} strokeWidth={2} />
      <span className="truncate">{children}</span>
    </div>
  );
}

function Primary({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="min-h-11 bg-white text-subhead font-semibold text-ink transition-[scale,opacity] duration-150 ease-out-soft active:scale-[0.97]"
      style={{ borderRadius: OPTIONS.radius }}
    >
      {children}
    </button>
  );
}

function WayOut({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="-mb-1 h-8 text-footnote text-white/45 transition-colors duration-150 hover:text-white/80"
    >
      {children}
    </button>
  );
}

// ─── Name ────────────────────────────────────────────────────

// A card is only ever on screen unanswered: once answered, the answer is the
// user's bubble and the card is gone (see appRows in persona-app.tsx).

function NameCard({ item }: { item: CardItem }) {
  return (
    <Shell icon={<RingIcon size={14} />} title="Name your Persona">
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-4 gap-1.5">
          {NAMES.map((name, index) => (
            <motion.button
              key={name}
              type="button"
              onClick={() => completeCard(item.id, { status: "chosen", name })}
              initial={{ opacity: 0, y: OPTIONS.riseY }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...CARD.spring, delay: OPTIONS.delay + index * OPTIONS.stagger }}
              className="min-h-11 bg-white/[0.07] text-subhead font-medium text-white transition-[background-color,scale] duration-150 ease-out-soft hover:bg-white/[0.12] active:scale-[0.96]"
              style={{ borderRadius: OPTIONS.radius }}
            >
              {name}
            </motion.button>
          ))}
        </div>
        <WayOut
          onPress={() => {
            completeCard(item.id, { status: "dismissed" });
            window.dispatchEvent(new Event("persona:focus-composer"));
          }}
        >
          I&apos;ll type my own
        </WayOut>
      </div>
    </Shell>
  );
}

// ─── Gmail ───────────────────────────────────────────────────

function GmailCard({ item }: { item: CardItem }) {
  const name = usePersonaName();
  return (
    <Shell
      icon={<MailIcon size={16} />}
      title="Connect Gmail"
      description={`So ${name} can triage, draft and send for you. Nothing goes out without your OK.`}
    >
      <div className="flex flex-col gap-1.5">
        <Primary onPress={() => openConsent(item.id)}>Connect Gmail</Primary>
        <WayOut onPress={() => completeCard(item.id, { status: "declined" })}>Not now</WayOut>
      </div>
    </Shell>
  );
}

// ─── Where to start ──────────────────────────────────────────

function TaskOptionsCard({ item }: { item: CardItem }) {
  const options: TaskOption[] = item.options ?? [];
  const fromInbox = item.source === "demo_inbox";

  return (
    <Shell
      icon={fromInbox ? <InboxIcon size={16} /> : <TasksIcon size={16} />}
      title={fromInbox ? "Found in your inbox" : "From your day"}
      badge={fromInbox ? "Demo" : undefined}
    >
      <div className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <motion.button
            key={option.title}
            type="button"
            onClick={() => completeCard(item.id, { status: "picked", task: option })}
            initial={{ opacity: 0, y: OPTIONS.riseY }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...CARD.spring, delay: OPTIONS.delay + index * OPTIONS.stagger }}
            className="flex min-h-14 flex-col justify-center gap-0.5 bg-white/[0.05] px-3 py-2.5 text-left text-white transition-[background-color,scale] duration-150 ease-out-soft hover:bg-white/[0.1] active:scale-[0.98]"
            style={{ borderRadius: OPTIONS.radius }}
          >
            <span className="text-subhead font-semibold">{option.title}</span>
            <span className="truncate text-footnote text-white/50">{option.detail}</span>
          </motion.button>
        ))}
      </div>
    </Shell>
  );
}

// ─── What Persona did with it ────────────────────────────────

/** Persona going through the inbox - a moment, shown honestly as one. */
export function InboxScanCard({ item }: { item: Extract<ThreadItem, { kind: "inbox_scan" }> }) {
  return (
    <Shell
      icon={
        item.done ? (
          <InboxIcon size={16} />
        ) : (
          <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-white/20 border-t-white/80" aria-hidden />
        )
      }
      title={item.done ? "Went through your inbox" : "Going through your inbox…"}
      badge="Demo"
    />
  );
}

/** The first real task - and, once it fires, proof it did. */
export function ReminderCard({ item }: { item: Extract<ThreadItem, { kind: "reminder" }> }) {
  const name = usePersonaName();
  return (
    <Shell
      icon={item.fired ? <BellRingingIcon size={16} /> : <BellIcon size={16} />}
      title={item.task}
      description={
        item.fired
          ? `Your band buzzed at ${item.when}.`
          : `${name} will buzz your band at ${item.when}.`
      }
      badge={item.fired ? undefined : `Demo · ${REMINDER_DEMO_SECONDS}s`}
    >
      {item.fired ? <Settled>Reminded you</Settled> : null}
    </Shell>
  );
}
