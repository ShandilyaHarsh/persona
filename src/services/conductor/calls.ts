import { isUserMessage, type CallOutcome } from "@/domain/onboarding";
import { MicrophoneError, type RealtimeSession } from "@/services/openai/realtime-session";
import { surfaceSpokenFinds } from "./inbox";
import { deliver, openSession } from "./sessions";
import { callConnecting, clearTimer, live, onboarding, onCall, patchLive, runtime, type Ringing } from "./state";
import { addEvent, recordCall } from "./thread";

const RING_TIMEOUT_MS = 25_000;
/** Persona stops offering calls after this many went unanswered. */
const MAX_UNANSWERED_CALLS = 2;
/** A press this soon after a call ends is the tail of a multi-press, not a new call. */
const PRESS_SETTLE_MS = 600;
/** A call ended this fast, with nothing said, was probably a mis-press. */
const MISPRESS_SECONDS = 3;
/** A transcript this short ("Thank you.", a cough) isn't the person talking. */
const MIN_MEANINGFUL_WORDS = 2;

export function onCallFailed(error: unknown) {
  // Browsers only offer a microphone to https pages and localhost; anywhere
  // else it looks exactly like a device with no microphone.
  if (!window.isSecureContext) {
    addEvent("Voice needs a secure (https) page");
    patchLive({ bandNotice: "Voice needs https or localhost" });
    deliver("A call on the band couldn't start because this page isn't served securely, so the browser won't offer a microphone. Carry on here in the app.");
    return;
  }
  const mic = error instanceof MicrophoneError ? error.kind : null;
  addEvent(mic === "missing" ? "No microphone found for the band" : mic ? "The band needs microphone access" : "The band couldn't connect");
  patchLive({
    bandNotice: mic === "missing" ? "No microphone found" : mic ? "Allow the microphone to talk" : "Couldn't connect. Try again",
  });
  deliver(
    mic === "missing"
      ? "A call on the band couldn't start because this device has no microphone. Carry on here in the app."
      : mic
        ? "A call on the band couldn't start because the microphone isn't allowed in this browser. Carry on here in the app; mention they can allow the mic if they want to talk."
        : "A call on the band failed to connect. Carry on here in the app.",
  );
}

/**
 * Everything a call could move forward, as one comparable string: what's been
 * learned, how Gmail stands, which cards have been answered, what's been set.
 */
export function progress(): string {
  const state = onboarding.get();
  return JSON.stringify({
    profile: state.profile,
    gmail: state.gmail,
    graduated: state.graduated,
    agents: state.agents,
    settled: state.thread.filter((item) => (item.kind === "card" && item.result) || item.kind === "reminder").length,
  });
}

/**
 * Close a band call and write it down. Returns whether it moved anything - a
 * saved detail, a card answered, or the person actually saying something (a
 * cough or a stray "thank you" doesn't count).
 */
export function finishCallRecord(call: RealtimeSession, outcome: CallOutcome): boolean {
  const startedAt = onboarding.get().callStartedAt ?? Date.now();
  clearTimer(runtime.silenceTimer);
  runtime.silenceTimer = null;
  call.close();
  patchLive({ session: null, speaking: false, caption: null });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  recordCall(outcome, seconds);
  runtime.lastCallEndedAt = Date.now();
  const spoke = onboarding
    .get()
    .thread.some(
      (item) =>
        isUserMessage(item) &&
        item.at >= startedAt &&
        (item.via === "app" || item.text.trim().split(/\s+/).length >= MIN_MEANINGFUL_WORDS),
    );
  const moved = spoke || runtime.typedDuringCall || (runtime.callBaseline !== null && runtime.callBaseline !== progress());
  runtime.callBaseline = null;
  runtime.typedDuringCall = false;
  surfaceSpokenFinds();
  if (!moved && outcome === "hung_up" && seconds < MISPRESS_SECONDS) {
    deliver("The call on the band ended within a couple of seconds, with nothing said - probably a mis-press. One short line offering to call back, nothing more.");
  }
  return moved;
}

/** End the live call because the person or Persona chose to. */
export function endCall(outcome: CallOutcome): boolean {
  const call = runtime.session;
  if (call?.surface !== "band") return false;
  runtime.session = null;
  return finishCallRecord(call, outcome);
}

/**
 * The app's last question, if it is still sitting on screen unanswered. The
 * call may have asked it again out loud - that's fine, a band has no screen -
 * but back in the app it is already there, and asking it a second time in
 * writing is what makes a conversation feel like a form.
 */
function unansweredQuestion(): string | null {
  const thread = onboarding.get().thread;
  for (let index = thread.length - 1; index >= 0; index--) {
    const item = thread[index];
    if (item.kind !== "message") continue;
    if (item.role === "user") return null;
    if (item.via === "band") continue;
    // A reply split into bubbles may ask in any of them, not just the last.
    const question = item.text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part.endsWith("?"))
      .at(-1);
    return question ?? null;
  }
  return null;
}

/** What a session picking the conversation back up in the app should know about the screen. */
export function backInApp(reason: string): string {
  const question = unansweredQuestion();
  return question
    ? `${reason} Your earlier question is still on their screen, unanswered: "${question}". Don't ask it again - move the conversation forward instead.`
    : reason;
}

/**
 * After a call, the app picks up with the next step - but only if the call got
 * somewhere. A call that went nowhere doesn't earn a message.
 */
export function afterCall(progressed: boolean, how: string) {
  if (!progressed) return;
  deliver(
    backInApp(
      `${how} Everything said on the call is in the conversation above (a line ending in … was cut off). In one short message, pick up with the very next step - no recap of the call.`,
    ),
  );
}

export function stopRinging() {
  clearTimer(runtime.ringTimer);
  runtime.ringTimer = null;
  patchLive({ ringing: null });
  if (onboarding.get().personaRingingSince) onboarding.set((state) => ({ ...state, personaRingingSince: null }));
}

/** Calls Persona placed that nobody picked up. */
function unansweredCalls(): number {
  return onboarding.get().calls.filter((call) => call.outcome === "missed" || call.outcome === "declined").length;
}

/** Light the band up and vibrate it, waiting for a press. */
export function ringBand(who: Ringing) {
  if (onCall() || callConnecting()) return { status: "already_on_a_call" };
  if (live.get().ringing) return { status: "already_ringing" };
  if (who === "persona" && unansweredCalls() >= MAX_UNANSWERED_CALLS) {
    return { error: "Not placed: two calls already went unanswered. Stay in the app unless they ask you to call." };
  }
  patchLive({ ringing: who, bandNotice: null });
  if (who === "persona") onboarding.set((state) => ({ ...state, personaRingingSince: Date.now() }));
  runtime.ringTimer = setTimeout(() => {
    stopRinging();
    // A call they asked for and then walked away from isn't news.
    if (who === "user") return;
    recordCall("missed", 0);
    deliver("The band rang out - they didn't pick up. Don't call again unless they ask.");
  }, RING_TIMEOUT_MS);
  return { status: "ringing" };
}

/** The app's Continue on band: the band lights up and vibrates; pressing it starts the call. */
export function continueOnBand() {
  // ringBand already stands down on a call, a connecting call or a ring.
  ringBand("user");
}

/** Taking back a Continue on band before the band is pressed. */
export function cancelRing() {
  if (live.get().ringing !== "user") return;
  stopRinging();
}

/** A press while a call is connecting takes it back - nothing to record, nothing said yet. */
function cancelConnectingCall() {
  runtime.generation++;
  runtime.opening = null;
  patchLive({ session: null, bandNotice: null, caption: null });
}

/** One press: dismiss a buzz, answer the band, cancel or end the call, or start one. */
export function bandPress() {
  const ringing = live.get().ringing;
  // A buzzing reminder is answered by pressing the band, like any alert - and
  // if a call is ringing at the same time, the same press answers it too.
  if (live.get().buzz) {
    clearTimer(runtime.buzzTimer);
    patchLive({ buzz: null });
    if (!ringing) return;
  }
  if (ringing) {
    stopRinging();
    void openSession(
      "band",
      ringing === "persona"
        ? "They answered your call on their band. Greet them and get into it - no need to re-introduce yourself if you've already met."
        : userPickupReason(),
    );
    return;
  }
  if (callConnecting()) {
    cancelConnectingCall();
    return;
  }
  if (onCall()) {
    afterCall(endCall("hung_up"), "The user ended the call by pressing their band.");
    return;
  }
  // The tail of a double or triple press shouldn't restart the call that just ended.
  if (Date.now() - runtime.lastCallEndedAt < PRESS_SETTLE_MS) return;
  const first = onboarding.get().thread.length === 0;
  void openSession(
    "band",
    first
      ? "The user just pressed their Persona Band for the very first time. Say hi in one short line and ask what they'd like to call you."
      : runtime.session?.surface === "app" || runtime.opening?.surface === "app"
        ? "The user moved the conversation to a call on their band. Carry on mid-thought - don't greet again or recap."
        : "The user pressed their band to talk to you. Pick up where you left off.",
  );
}

/** Picking up a call they started from the app - often to answer the question on screen out loud. */
function userPickupReason(): string {
  const question = unansweredQuestion();
  return question
    ? `The user moved to a call on their band to answer your question out loud: "${question}". Ask it again in a few words - no greeting, no recap.`
    : "The user moved the conversation from the app to a call on their band. Carry on mid-thought from the last thing in the conversation - don't greet again or recap.";
}

/** Two presses: decline a ringing call (or cancel your own). Otherwise the same as one press. */
export function bandDoublePress() {
  const ringing = live.get().ringing;
  if (!ringing) {
    bandPress();
    return;
  }
  stopRinging();
  if (ringing === "user") return;
  recordCall("declined", 0);
  deliver("They declined your call on the band. That's fine - continue here in the app, and don't call again unless they ask.");
}
