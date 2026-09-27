/**
 * The onboarding's single source of truth, shared by every surface.
 *
 * Nothing here knows about a band, a phone, or a model. A conversation that
 * starts on the wrist and finishes in the app is the same record read by two
 * different sessions, so the record has to be the thing that is persisted - not
 * any one session's memory of it.
 */

/**
 * Where a conversation happens: "app" is messaging in the Persona app, "band"
 * is a call on the wrist.
 */
const SURFACES = ["app", "band"] as const;
export type Surface = (typeof SURFACES)[number];

type Profile = {
  agentName?: string;
  userName?: string;
  gmail?: string;
  helpWith?: string;
};

const GMAIL_STATUSES = ["unasked", "connected", "declined"] as const;
type GmailStatus = (typeof GMAIL_STATUSES)[number];

const CALL_OUTCOMES = ["completed", "declined", "missed", "hung_up", "dropped"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** One call on the band, however it ended. */
type CallRecord = {
  outcome: CallOutcome;
  at: number;
  seconds: number;
};

export const CARD_KINDS = ["name_agent", "connect_gmail", "task_options"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** A task Persona drew out of the user's story, offered back as something to tap. */
export type TaskOption = { title: string; detail: string };

export type CardResult =
  | { status: "chosen"; name: string }
  | { status: "connected"; email: string }
  | { status: "picked"; task: TaskOption }
  | { status: "declined" }
  | { status: "dismissed" };

export type ThreadItem =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      text: string;
      via: Surface;
      at: number;
    }
  | {
      kind: "card";
      id: string;
      card: CardKind;
      /** task_options: the two or three tasks drawn out of their story or inbox. */
      options?: TaskOption[];
      /** task_options: where the options came from, when it's worth saying - the demo inbox. */
      source?: "demo_inbox";
      result?: CardResult;
      at: number;
    }
  /** A first real task, set during onboarding; the band buzzes when it fires. */
  | {
      kind: "reminder";
      id: string;
      task: string;
      /** When it's for, as the user would say it: "6:00 PM". */
      when: string;
      /** When the demo fires it - the same moment, with time compressed. */
      firesAt: number;
      fired: boolean;
      at: number;
    }
  /**
   * Persona going through the (demo) inbox after Gmail connects - it takes a
   * moment. `delivered` is set once the finds have reached the person, as a
   * card or out loud, so a reload never hands them over twice.
   */
  | { kind: "inbox_scan"; id: string; readyAt: number; done: boolean; delivered: boolean; at: number }
  | { kind: "event"; id: string; text: string; at: number };

export type MessageItem = Extract<ThreadItem, { kind: "message" }>;
export type CardItem = Extract<ThreadItem, { kind: "card" }>;

export function isUserMessage(item: ThreadItem): item is MessageItem {
  return item.kind === "message" && item.role === "user";
}

/** Long enough for any real name, short enough that a "name" can't carry instructions into the prompt. */
export const MAX_NAME_LENGTH = 24;

/** Bumped whenever the saved shape changes; older saves start fresh. */
const SCHEMA_VERSION = 3;

export type OnboardingState = {
  version: number;
  profile: Profile;
  gmail: GmailStatus;
  calls: CallRecord[];
  graduated: boolean;
  /**
   * Whether they've used a personal agent before (Muse, Instinct, Poke), asked
   * while the inbox scan runs. Someone who has skips discovery.
   */
  agents: { used: boolean; at: number } | null;
  thread: ThreadItem[];
  /**
   * When the band call still open at the page's last write began. Read once on
   * load: if it is still set, the tab closed or reloaded mid-call, and that is
   * a dropped call the next session should know about.
   */
  callStartedAt: number | null;
  /**
   * Persona ringing the band, saved so that a reload mid-ring still counts as
   * a missed call rather than vanishing.
   */
  personaRingingSince: number | null;
};

export const INITIAL_STATE: OnboardingState = {
  version: SCHEMA_VERSION,
  profile: {},
  gmail: "unasked",
  calls: [],
  graduated: false,
  agents: null,
  thread: [],
  callStartedAt: null,
  personaRingingSince: null,
};

/**
 * A saved record, if it's one this version can use. Anything else - another
 * schema, a hand-edited value, a truncated write - is reported and replaced,
 * never half-trusted.
 */
export function parseSaved(value: unknown): OnboardingState | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    console.warn("[onboarding] saved record isn't an object; ignoring it.");
    return null;
  }
  if (value.version !== SCHEMA_VERSION) {
    console.warn(`[onboarding] saved record is version ${String(value.version)}, expected ${SCHEMA_VERSION}; ignoring it.`);
    return null;
  }
  const valid =
    isProfile(value.profile) &&
    isOneOf(GMAIL_STATUSES, value.gmail) &&
    Array.isArray(value.calls) &&
    value.calls.every(isCallRecord) &&
    typeof value.graduated === "boolean" &&
    (value.agents === null || (isRecord(value.agents) && typeof value.agents.used === "boolean" && typeof value.agents.at === "number")) &&
    Array.isArray(value.thread) &&
    value.thread.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.kind === "string") &&
    (value.callStartedAt === null || typeof value.callStartedAt === "number") &&
    (value.personaRingingSince === null || typeof value.personaRingingSince === "number");
  if (!valid) {
    console.warn("[onboarding] saved record is malformed; ignoring it.");
    return null;
  }
  // Every field is checked above. Thread items are only checked for shape: this
  // app wrote them under the same schema version, which is what the version guards.
  return value as OnboardingState;
}

/** The four things onboarding exists to learn, in the order they read best. */
export const FIELDS = [
  { key: "agentName", label: "Assistant's name" },
  { key: "userName", label: "Your name" },
  { key: "gmail", label: "Gmail" },
  { key: "helpWith", label: "What you need" },
] as const satisfies ReadonlyArray<{ key: keyof Profile; label: string }>;

export function missingFields(state: Pick<OnboardingState, "profile" | "gmail">): string[] {
  return FIELDS.filter(({ key }) =>
    key === "gmail" ? state.gmail !== "connected" : !state.profile[key],
  ).map(({ key }) => key);
}

/**
 * What a new session is handed about everything before it. Only what the model
 * can use: cards become one line each, and the thread is cut to its tail so a
 * long history never crowds out the instructions.
 */
export type SessionContext = {
  profile: Profile;
  gmail: GmailStatus;
  calls: CallRecord[];
  graduated: boolean;
  /** The Persona app is on the phone's screen right now. */
  appOpen: boolean;
  history: string[];
};

/** What the client sends to mint a session: where it opens, and what it should know. */
export type SessionRequest = { surface: Surface; context: SessionContext };

/** A mint request as it arrives over the network, if it is one. */
export function parseSessionRequest(value: unknown): SessionRequest | null {
  if (!isRecord(value) || !isOneOf(SURFACES, value.surface)) return null;
  const context = value.context;
  const valid =
    isRecord(context) &&
    isProfile(context.profile) &&
    isOneOf(GMAIL_STATUSES, context.gmail) &&
    Array.isArray(context.calls) &&
    context.calls.every(isCallRecord) &&
    typeof context.graduated === "boolean" &&
    typeof context.appOpen === "boolean" &&
    Array.isArray(context.history) &&
    context.history.every((line) => typeof line === "string");
  // Every field of SessionContext is checked above.
  return valid ? { surface: value.surface, context: context as SessionContext } : null;
}

const HISTORY_LIMIT = 40;

export function historyLines(thread: ThreadItem[]): string[] {
  return thread.slice(-HISTORY_LIMIT).map((item) => {
    if (item.kind === "event") return `[event] ${item.text}`;
    if (item.kind === "reminder") {
      return `[event] You set a reminder: "${item.task}" at ${item.when} (${item.fired ? "it has fired - the band buzzed" : "not fired yet"})`;
    }
    if (item.kind === "inbox_scan") {
      return item.done
        ? "[event] You finished going through their (demo) inbox"
        : "[event] You're going through their (demo) inbox - not finished yet";
    }
    if (item.kind === "card") return `[card ${item.card}] ${describeResult(item.result)}`;
    const who = item.role === "user" ? "User" : "You";
    return `${who} (${item.via === "band" ? "on a call on the band" : "in the app"}): ${item.text}`;
  });
}

function describeResult(result: CardResult | undefined): string {
  if (!result) return "still open";
  switch (result.status) {
    case "chosen":
      return `named you "${result.name}"`;
    case "connected":
      return `connected ${result.email}`;
    case "picked":
      return `picked "${result.task.title}"`;
    default:
      return result.status;
  }
}

/**
 * `crypto.randomUUID` only exists on secure origins; opening the prototype over
 * a LAN address for a phone demo shouldn't break every message.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

export function isCardKind(value: unknown): value is CardKind {
  return isOneOf(CARD_KINDS, value);
}

function isProfile(value: unknown): value is Profile {
  return isRecord(value) && FIELDS.every(({ key }) => value[key] === undefined || typeof value[key] === "string");
}

function isCallRecord(value: unknown): value is CallRecord {
  return (
    isRecord(value) && isOneOf(CALL_OUTCOMES, value.outcome) && typeof value.at === "number" && typeof value.seconds === "number"
  );
}
