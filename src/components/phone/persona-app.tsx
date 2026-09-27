"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useBandCall } from "@/components/band/use-band-call";
import { ArrowUpIcon, BandIcon } from "@/components/icons";
import { usePersonaName } from "@/components/use-persona-name";
import { continueOnBand, live, onboarding, sendText } from "@/services/conductor";
import type { ThreadItem } from "@/domain/onboarding";
import { useStore } from "@/lib/store";

import { CallPill } from "./call-pill";
import { CardBody, InboxScanCard, ReminderCard } from "./cards";

/* ─────────────────────────────────────────────────────────
 * THE PERSONA APP
 *
 * Where you message Persona. Talking happens on the band: Continue on band,
 * beside the composer, lights it up, and the pill at the top says what it's
 * doing. When Persona is waiting on an answer, "Answer on call" joins the
 * question's group - the moment talking is easier than typing. The whole
 * conversation shows here, whichever of the two it happened in - including
 * how each call went.
 *
 * Spacing is owned by the rows, not the scroll container. A turn is one
 * sender's group of bubbles, or a card, reminder, inbox scan, event line or
 * "In the app / On a call" marker: 16 between turns, 4 inside a group. A
 * message splits into one bubble per paragraph, and consecutive messages from
 * one sender share a group. Bubbles are 20 (inside the card's 24); corners
 * that face the rest of their group tighten to 6.
 * ───────────────────────────────────────────────────────── */

const APP_BACKGROUND = "radial-gradient(120% 60% at 50% 0%, #1b1c1e 0%, #0b0b0c 60%)";

export function PersonaApp() {
  return (
    <div className="flex size-full flex-col text-white" style={{ background: APP_BACKGROUND }}>
      <Conversation />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * ANSWER ON CALL
 *
 *    0ms   Persona's question lands
 *  250ms   chip fades up beneath it (y 4 → 0)
 *  tap     band rings; chip leaves as the pill appears
 *  reply   chip leaves - the question is answered
 * ───────────────────────────────────────────────────────── */

const ANSWER_CHIP = {
  delay: 0.25,
  enterY: 4,
  spring: { type: "spring", duration: 0.35, bounce: 0 } as const,
};

const ROW = {
  enterY: 8,
  spring: { type: "spring", duration: 0.35, bounce: 0 } as const,
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};

type Role = Extract<ThreadItem, { kind: "message" }>["role"];

/** Where a bubble sits in its group, which decides which corners tighten. */
type BubbleShape = "single" | "first" | "middle" | "last";

type Row =
  | Extract<ThreadItem, { kind: "card" | "reminder" | "inbox_scan" | "event" }>
  | { kind: "bubble"; id: string; role: Role; text: string; shape: BubbleShape }
  | { kind: "typing"; id: string; shape: BubbleShape }
  | { kind: "answer"; id: string };

type SpacedRow = { row: Row; spacing: "none" | "group" | "turn" };

const ROW_SPACING: Record<SpacedRow["spacing"], string> = {
  none: "",
  group: "mt-1",
  turn: "mt-4",
};

/** A paragraph of a message, or (text null) Persona's typing dots holding the next one's place. */
type GroupEntry = { id: string; text: string | null };

/**
 * Persona's question, if it's the last thing in the thread and still open.
 * A card after it is already the way to answer, so no chip then.
 */
function openQuestion(thread: ThreadItem[]): string | null {
  const last = thread.at(-1);
  if (!last || last.kind !== "message" || last.role !== "assistant" || last.via !== "app") return null;
  return last.text.includes("?") ? last.id : null;
}

/** A blank line in a message starts a new bubble rather than leaving a gap inside one. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function bubbleShape(index: number, count: number): BubbleShape {
  if (count === 1) return "single";
  if (index === 0) return "first";
  return index === count - 1 ? "last" : "middle";
}

/**
 * The whole conversation - what was typed here and said on the band - as
 * rows, each knowing how far it sits from the one above. The typing dots and the
 * answer chip join Persona's group as one more item in it.
 */
function threadRows(thread: ThreadItem[], { typing, question }: { typing: boolean; question: string | null }): SpacedRow[] {
  const rows: SpacedRow[] = [];
  let group: { role: Role; entries: GroupEntry[] } | null = null;

  const push = (row: Row, inGroup: boolean) =>
    rows.push({ row, spacing: rows.length === 0 ? "none" : inGroup ? "group" : "turn" });
  const closeGroup = () => {
    if (!group) return;
    const { role, entries } = group;
    entries.forEach(({ id, text }, index) => {
      const shape = bubbleShape(index, entries.length);
      push(text === null ? { kind: "typing", id, shape } : { kind: "bubble", id, role, text, shape }, index > 0);
    });
    group = null;
  };
  const addToGroup = (role: Role, entries: GroupEntry[]) => {
    if (group?.role !== role) {
      closeGroup();
      group = { role, entries: [] };
    }
    group.entries.push(...entries);
  };

  for (const item of thread) {
    // An answered card has done its job: the answer is the user's bubble.
    if (item.kind === "card" && item.result) continue;
    if (item.kind !== "message") {
      closeGroup();
      push(item, false);
      continue;
    }
    addToGroup(
      item.role,
      paragraphs(item.text).map((text, index) => ({ id: `${item.id}:${index}`, text })),
    );
  }
  if (typing) addToGroup("assistant", [{ id: "typing", text: null }]);
  closeGroup();
  if (question) push({ kind: "answer", id: `answer:${question}` }, true);
  return rows;
}

function Conversation() {
  const { thread, profile } = useStore(onboarding);
  const { session, thinking, ringing } = useStore(live);
  const bandCall = useBandCall();
  const name = usePersonaName();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dots mean a reply is coming: the model is writing, or a session is still
  // connecting with the user's message waiting on it. A session opening quietly
  // behind the greeting owes nobody anything.
  const awaitingReply = thread.findLast((item) => item.kind === "message")?.role === "user";
  const typing = session?.surface === "app" && (thinking || (session.status === "connecting" && awaitingReply));
  const onBand = bandCall !== null || ringing !== null;
  const question = typing || onBand ? null : openQuestion(thread);
  const rows = threadRows(thread, { typing, question });
  // Typing alone isn't a conversation yet: the greeting stays until something is said.
  const hasThread = rows.some(({ row }) => row.kind !== "typing");
  const lastRowId = rows.at(-1)?.row.id;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [rows.length, lastRowId]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <header className="flex flex-col items-center gap-3 pb-3 pt-[62px]">
        <CallPill />
        {hasThread ? <span className="text-subhead font-semibold text-white/90">{name}</span> : null}
      </header>

      {hasThread ? null : (
        <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <h1 className="text-title1 font-semibold">
            {greeting}
            {profile.userName ? `, ${profile.userName}` : ""}
          </h1>
          <p className="mt-2 text-subhead text-white/55">Message me here, or press your band to talk.</p>
        </div>
      )}

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${name}`}
        className={`no-scrollbar flex-col overflow-y-auto px-5 pb-3 ${hasThread ? "flex flex-1" : "hidden"}`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map(({ row, spacing }) =>
            row.kind === "answer" ? (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: ANSWER_CHIP.enterY }}
                animate={{ opacity: 1, y: 0, transition: { ...ANSWER_CHIP.spring, delay: ANSWER_CHIP.delay } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className={`flex ${ROW_SPACING[spacing]}`}
              >
                <AnswerOnCall />
              </motion.div>
            ) : (
              <motion.div
                key={row.id}
                layout="position"
                initial={{ opacity: 0, y: ROW.enterY }}
                animate={{ opacity: 1, y: 0 }}
                exit={ROW.exit}
                transition={ROW.spring}
                className={ROW_SPACING[spacing]}
              >
                <ThreadRow row={row} />
              </motion.div>
            ),
          )}
        </AnimatePresence>
      </div>

      <AppComposer name={name} onCall={bandCall !== null} onBand={onBand} />
    </>
  );
}

const PERSONA_BUBBLE =
  "w-fit max-w-[80%] rounded-[20px] bg-white/[0.06] px-3 py-2 text-body text-white/90 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)]";
const USER_BUBBLE = "max-w-[80%] rounded-[20px] bg-white/[0.14] px-3 py-2 text-body text-white";

// Only the corners that face the rest of the group tighten; the outer edge stays round.
const BUBBLE_CORNERS: Record<Role, Record<BubbleShape, string>> = {
  assistant: { single: "", first: "rounded-bl-[6px]", middle: "rounded-l-[6px]", last: "rounded-tl-[6px]" },
  user: { single: "", first: "rounded-br-[6px]", middle: "rounded-r-[6px]", last: "rounded-tr-[6px]" },
};

function ThreadRow({ row }: { row: Exclude<Row, { kind: "answer" }> }) {
  switch (row.kind) {
    case "event":
      return <p className="text-center text-caption font-medium text-white/35">{row.text}</p>;
    case "card":
      return <CardBody item={row} />;
    case "reminder":
      return <ReminderCard item={row} />;
    case "inbox_scan":
      return <InboxScanCard item={row} />;
    case "typing":
      return (
        <div className={`${PERSONA_BUBBLE} ${BUBBLE_CORNERS.assistant[row.shape]}`} aria-label="Typing">
          <span className="flex h-[22px] items-center gap-1">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1.5 rounded-full bg-white/60"
                style={{ animation: `typing-dot 1.2s ${dot * 0.15}s infinite ease-in-out` }}
              />
            ))}
          </span>
        </div>
      );
    case "bubble":
      return row.role === "user" ? (
        <div className="flex justify-end">
          <p className={`whitespace-pre-line ${USER_BUBBLE} ${BUBBLE_CORNERS.user[row.shape]}`}>{row.text}</p>
        </div>
      ) : (
        <p className={`whitespace-pre-line ${PERSONA_BUBBLE} ${BUBBLE_CORNERS.assistant[row.shape]}`}>{row.text}</p>
      );
  }
}

function AnswerOnCall() {
  return (
    <button
      type="button"
      onClick={continueOnBand}
      className="relative flex min-h-8 items-center gap-1.5 rounded-full bg-white/[0.12] pl-2.5 pr-3 text-footnote font-medium text-white/90 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)] transition-[background-color,scale] duration-150 ease-out-soft before:absolute before:-inset-y-1.5 before:inset-x-0 hover:bg-white/15 active:scale-[0.96]"
    >
      <BandIcon size={16} />
      Answer on call
    </button>
  );
}

function AppComposer({ name, onCall, onBand }: { name: string; onCall: boolean; onBand: boolean }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasDraft = draft.trim().length > 0;

  // The name card's "I'll type my own" hands focus here.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("persona:focus-composer", focus);
    return () => window.removeEventListener("persona:focus-composer", focus);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasDraft) return;
    void sendText(draft);
    setDraft("");
  }

  // Lulu's composer: one rounded field with send inside it, one button beside it.
  return (
    <form onSubmit={submit} className="flex items-end gap-2 px-4 pb-10 pt-2">
      <label className="flex min-h-11 flex-1 items-center rounded-[20px] bg-white/8 pl-4 pr-1.5 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)] transition-[background-color] duration-150 focus-within:bg-white/12">
        <span className="sr-only">Message</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={onCall ? "Type to add to the call" : `Message ${name}`}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-body text-white outline-none placeholder:text-white/35"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!hasDraft}
          className="flex size-8 items-center justify-center rounded-full bg-white text-ink transition-[opacity,scale] duration-150 ease-out-soft active:scale-[0.96] disabled:scale-75 disabled:opacity-0"
        >
          <ArrowUpIcon size={18} strokeWidth={2.25} />
        </button>
      </label>
      <button
        type="button"
        onClick={continueOnBand}
        disabled={onBand}
        aria-label="Continue on your band"
        title="Continue on your band"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)] transition-[scale,opacity] duration-150 ease-out-soft active:scale-[0.96] disabled:opacity-35"
      >
        <BandIcon size={22} />
      </button>
    </form>
  );
}
