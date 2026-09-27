import { REMINDER_DEMO_SECONDS } from "@/domain/demo";
import {
  isCardKind,
  isUserMessage,
  MAX_NAME_LENGTH,
  missingFields,
  newId,
  type CardItem,
  type Surface,
  type TaskOption,
} from "@/domain/onboarding";
import type { RealtimeSession } from "@/services/openai/realtime-session";
import { afterCall, backInApp, endCall, ringBand } from "./calls";
import { CARD_BANNERS, openCards, settleCards } from "./cards";
import { deliverFindsIfReady } from "./inbox";
import { addReminder } from "./reminders";
import { deliver } from "./sessions";
import { onboarding, runtime } from "./state";
import { placeCard, placeCardAfterNextLine } from "./thread";

const MAX_TASK_OPTIONS = 3;

/**
 * Every tool runs on behalf of one session. Anything that waits - for a
 * sentence to finish being spoken - checks afterwards that the session is
 * still the one holding the conversation, and writes nothing if it isn't.
 */
export async function runTool(
  owner: RealtimeSession,
  surface: Surface,
  name: string,
  args: Record<string, unknown>,
  spoke: boolean,
): Promise<unknown> {
  if (owner !== runtime.session) return { error: "This conversation has moved on." };
  switch (name) {
    case "save_details":
      return saveDetails(args);
    case "show_card":
      return showCard(owner, args, spoke);
    case "start_call":
      return ringBand("persona");
    case "set_reminder":
      return setReminder(args);
    case "redact_last_message":
      return redactLastMessage();
    case "end_call":
      return hangUp(owner, surface, args);
    case "graduate":
      return graduate();
    default:
      return { error: `Unknown tool ${name}.` };
  }
}

/** A non-empty string, trimmed. */
function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

/** A name as the user gave it, trimmed and capped. */
function asName(value: unknown): string | undefined {
  return asText(value)?.slice(0, MAX_NAME_LENGTH).trim();
}

/** true / false, or the words a model sometimes sends instead. */
function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const word = value.trim().toLowerCase();
  if (["true", "yes", "y"].includes(word)) return true;
  if (["false", "no", "n"].includes(word)) return false;
  return undefined;
}

/** The well-formed options, at most three; malformed ones are dropped. */
function asTaskOptions(value: unknown): TaskOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options: unknown[] = value;
  return options
    .flatMap((option): TaskOption[] => {
      if (typeof option !== "object" || option === null || !("title" in option) || !("detail" in option)) return [];
      const { title, detail } = option;
      return typeof title === "string" && typeof detail === "string" ? [{ title, detail }] : [];
    })
    .slice(0, MAX_TASK_OPTIONS);
}

function saveDetails(args: Record<string, unknown>) {
  const agentName = asName(args.agent_name);
  const userName = asName(args.user_name);
  const helpWith = asText(args.help_with);
  const declinedGmail = asBoolean(args.gmail_declined) === true && onboarding.get().gmail !== "connected";
  const usedAgents = asBoolean(args.used_agents);
  // A model that thinks it saved something it didn't would carry on believing it.
  const ignored = Object.entries(args)
    .filter(([key, value]) => {
      if (value === undefined || value === null) return false;
      if (key === "agent_name") return !agentName;
      if (key === "user_name") return !userName;
      if (key === "help_with") return !helpWith;
      if (key === "used_agents" || key === "gmail_declined") return asBoolean(value) === undefined;
      return true;
    })
    .map(([key]) => key);

  onboarding.set((state) => ({
    ...state,
    profile: {
      ...state.profile,
      ...(agentName && { agentName }),
      ...(userName && { userName }),
      ...(helpWith && { helpWith }),
    },
    ...(declinedGmail && { gmail: "declined" as const }),
    ...(usedAgents !== undefined && { agents: { used: usedAgents, at: Date.now() } }),
    // Said in words rather than tapped: an open card settles the same way.
    thread: state.thread.map((entry) => {
      if (entry.kind !== "card" || entry.result) return entry;
      if (declinedGmail && entry.card === "connect_gmail") return { ...entry, result: { status: "declined" as const } };
      if (agentName && entry.card === "name_agent") return { ...entry, result: { status: "chosen" as const, name: agentName } };
      if (helpWith && entry.card === "task_options") return { ...entry, result: { status: "dismissed" as const } };
      return entry;
    }),
  }));
  // Someone who has used an agent before gets the finds as soon as they exist;
  // this turn's reply will see them.
  if (usedAgents !== undefined) deliverFindsIfReady(false);
  return {
    status: ignored.length ? "partly_saved" : "saved",
    ...(gmailIsNext() && {
      next: "Both names are in, so Gmail is next: call show_card connect_gmail now. If you already mentioned Gmail this turn, say nothing more; otherwise one short line asking them to hook it up.",
    }),
    ...(ignored.length && { not_saved: ignored, why: "Each must be a non-empty string, or true/false for used_agents and gmail_declined." }),
    still_missing: missingFields(onboarding.get()),
    note: "If you already said your next line this turn, say nothing more.",
  };
}

/** Names settled, Gmail undecided, and no Gmail card asked yet: the brief's next step. */
function gmailIsNext(): boolean {
  const state = onboarding.get();
  return (
    Boolean(state.profile.agentName && state.profile.userName) &&
    state.gmail === "unasked" &&
    !state.thread.some((item) => item.kind === "card" && item.card === "connect_gmail")
  );
}

async function showCard(owner: RealtimeSession, args: Record<string, unknown>, spoke: boolean): Promise<unknown> {
  const card = args.card;
  if (!isCardKind(card)) return { error: "Unknown card." };

  const state = onboarding.get();
  const userAsked = asBoolean(args.user_asked) === true;
  // Cards that would teach nobody anything, or ask again what was answered.
  if (card === "connect_gmail" && state.gmail === "connected") return { status: "connected", email: state.profile.gmail };
  if (card === "connect_gmail" && state.gmail === "declined" && !userAsked) {
    return { error: "Not shown: they declined Gmail. Only show it again if they ask - then pass user_asked: true." };
  }
  if (card === "name_agent" && state.profile.agentName) {
    return { error: `Not shown: you're already called ${state.profile.agentName}.` };
  }
  if (runtime.pendingCard?.item.card === card) {
    return { status: "shown", note: "It appears right after your next line." };
  }
  if (card === "task_options" && openCards("task_options").length > 0) {
    return { error: "Not shown: a card of options is already on screen. Add anything new in words." };
  }

  const options = card === "task_options" ? asTaskOptions(args.options) : undefined;
  if (card === "task_options" && (!options || options.length < 2)) {
    return { error: "task_options needs two or three options, each with a title and a detail." };
  }

  // The card follows the sentence that introduces it, never lands on top of it.
  await owner.waitForSpeechEnd();
  if (owner !== runtime.session) return { status: "not_shown", reason: "The conversation moved on." };

  // Moving on to Gmail closes the naming step, whatever state it was left in.
  if (card === "connect_gmail") settleCards(openCards("name_agent").map((item) => item.id), { status: "dismissed" });
  const item: CardItem = { kind: "card", id: newId(), card, options, at: Date.now() };
  // Said already: it goes in now. Not said yet (the line comes in the reply
  // after this call): it waits for it.
  if (spoke) placeCard(item, CARD_BANNERS[card]);
  else placeCardAfterNextLine(item, CARD_BANNERS[card]);

  // The card doesn't hold the conversation hostage: people answer in words as
  // often as they tap. Whatever they tap arrives later as an [event].
  return {
    status: "shown",
    note: "Wait for them to act on it - the result arrives as an [event]. If they answer in words instead, go with that.",
  };
}

function setReminder(args: Record<string, unknown>) {
  const task = asText(args.task);
  const when = asText(args.when);
  if (!task || !when) return { error: "A reminder needs a task and a time." };
  if (!onboarding.get().graduated && onboarding.get().thread.some((item) => item.kind === "reminder")) {
    return { error: "Not set: onboarding already has its first task. One is enough." };
  }
  addReminder(task, when);
  // The first thing they wanted help with is the thing being set in motion.
  if (!onboarding.get().profile.helpWith) {
    onboarding.set((state) => ({ ...state, profile: { ...state.profile, helpWith: task } }));
  }
  // The first real action is the end of onboarding - invisibly, no announcement.
  graduate();
  return {
    status: "set",
    note: `In this demo, time is compressed: it will fire in about ${REMINDER_DEMO_SECONDS} seconds and their band will buzz. If you haven't said what you set, say it in one short line; if you have, say nothing more. You'll get an [event] when it fires.`,
  };
}

function redactLastMessage() {
  const last = onboarding.get().thread.findLast(isUserMessage);
  if (!last) return { status: "nothing_to_redact" };
  onboarding.set((state) => ({
    ...state,
    thread: state.thread.map((item) =>
      item.id === last.id && item.kind === "message" ? { ...item, text: "[removed - it looked like a password]" } : item,
    ),
  }));
  return { status: "removed", note: "It's gone from their conversation. Tell them kindly never to share passwords here." };
}

/** Persona ends the call itself, once its goodbye has finished playing. */
async function hangUp(owner: RealtimeSession, surface: Surface, args: Record<string, unknown>) {
  if (surface !== "band") return { error: "There is no call to end." };
  await owner.waitForSpeechEnd();
  if (owner !== runtime.session) return { status: "already_ended" };
  const wantsToType = args.reason === "user_wants_to_type";
  const progressed = endCall(wantsToType || args.reason === "user_wants_to_stop" ? "hung_up" : "completed");
  if (wantsToType) {
    deliver(backInApp("You just ended the call because they'd rather type. Pick up right here in the app, mid-thought."));
  } else {
    afterCall(progressed, "You just wrapped up the call on the band.");
  }
  return { status: "ended" };
}

function graduate() {
  onboarding.set((state) => ({ ...state, graduated: true }));
  return { status: "graduated", still_missing: missingFields(onboarding.get()) };
}
