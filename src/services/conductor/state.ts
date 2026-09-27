import { INITIAL_STATE, type CardItem, type OnboardingState, type Surface } from "@/domain/onboarding";
import type { RealtimeSession } from "@/services/openai/realtime-session";
import { createStore } from "@/lib/store";

export const STORAGE_KEY = "persona.onboarding.v2";
/** An overdue timer (re-armed after a reload) fires a moment after load, not in the middle of it. */
const MIN_PENDING_DELAY_MS = 1_000;

type PhoneScreen = "home" | "persona";

/** Who is ringing the band: Persona (it asked, they agreed) or the user (the app's Continue on band). */
export type Ringing = "persona" | "user";

type LiveState = {
  phoneScreen: PhoneScreen;
  session: { surface: Surface; status: "connecting" | "live" } | null;
  speaking: boolean;
  thinking: boolean;
  /** The band is lit and vibrating, waiting to be pressed. */
  ringing: Ringing | null;
  /** The Google consent sheet, open for this card. */
  consentFor: string | null;
  banner: { id: string; title: string; body: string } | null;
  /** The last thing said on the call, shown beneath the band. */
  caption: { role: "user" | "assistant"; text: string } | null;
  /** A short line under the band when something needs the user's hand. */
  bandNotice: string | null;
  /** Messages that arrived while the app was closed. */
  unread: number;
  /** A reminder going off: the band buzzes until it's pressed or settles. */
  buzz: { id: string; task: string } | null;
};

export const INITIAL_LIVE: LiveState = {
  phoneScreen: "home",
  session: null,
  speaking: false,
  thinking: false,
  ringing: null,
  consentFor: null,
  banner: null,
  caption: null,
  bandNotice: null,
  unread: 0,
  buzz: null,
};

export const onboarding = createStore<OnboardingState>(INITIAL_STATE, STORAGE_KEY);
export const live = createStore<LiveState>(INITIAL_LIVE);

/**
 * The conductor's own working state, shared by its modules. It lives on one
 * object because a module can't assign to another module's `let` export.
 */
type Runtime = {
  session: RealtimeSession | null;
  /**
   * Every open, cancel and reset bumps this. A connection - or a timer, or a
   * tool call - from an earlier generation finds out it is stale and stands down.
   */
  generation: number;
  opening: { surface: Surface; promise: Promise<RealtimeSession | null> } | null;
  /** Things that happened while a session was connecting, delivered when one lands. */
  pendingEvents: Array<{ text: string; respond: boolean }>;
  ringTimer: ReturnType<typeof setTimeout> | null;
  bannerTimer: ReturnType<typeof setTimeout> | null;
  buzzTimer: ReturnType<typeof setTimeout> | null;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  findsFallbackTimer: ReturnType<typeof setTimeout> | null;
  /** What onboarding had learned when the current call began, to tell whether the call moved anything. */
  callBaseline: string | null;
  /** Something was typed into the app during the current call - that's talking too. */
  typedDuringCall: boolean;
  lastCallEndedAt: number;
  /** The inbox scan is done and its finds are waiting for the right moment to go out. */
  inboxFindsHeld: boolean;
  /** A card whose introducing line hasn't arrived yet. */
  pendingCard: { item: CardItem; banner: string; timer: ReturnType<typeof setTimeout> } | null;
  /** Reminders and the inbox scan: things that finish later, by id. */
  pendingTimers: Map<string, ReturnType<typeof setTimeout>>;
};

export const runtime: Runtime = {
  session: null,
  generation: 0,
  opening: null,
  pendingEvents: [],
  ringTimer: null,
  bannerTimer: null,
  buzzTimer: null,
  silenceTimer: null,
  findsFallbackTimer: null,
  callBaseline: null,
  typedDuringCall: false,
  lastCallEndedAt: 0,
  inboxFindsHeld: false,
  pendingCard: null,
  pendingTimers: new Map(),
};

export function patchLive(patch: Partial<LiveState>) {
  live.set((state) => ({ ...state, ...patch }));
}

export function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) clearTimeout(timer);
}

/**
 * Run `fire` at `at` on behalf of the thread item `id` - unless the item is
 * gone by then (a reset, or another tab's record replaced ours).
 */
export function schedulePending(id: string, at: number, fire: () => void) {
  const timer = setTimeout(
    () => {
      runtime.pendingTimers.delete(id);
      if (!onboarding.get().thread.some((item) => item.id === id)) return;
      fire();
    },
    Math.max(MIN_PENDING_DELAY_MS, at - Date.now()),
  );
  runtime.pendingTimers.set(id, timer);
}

export function appOpen(): boolean {
  return live.get().phoneScreen === "persona";
}

export function onCall(): boolean {
  return runtime.session?.surface === "band";
}

/** A band call on its way - connecting counts, so a press can cancel it. */
export function callConnecting(): boolean {
  return runtime.opening?.surface === "band";
}
