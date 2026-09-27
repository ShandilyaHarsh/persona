import { historyLines, newId, type MessageItem, type SessionContext, type Surface } from "@/domain/onboarding";
import { RealtimeSession, type EndReason } from "@/services/openai/realtime-session";
import { backInApp, finishCallRecord, onCallFailed, progress } from "./calls";
import { releaseHeldFinds } from "./inbox";
import { showBanner } from "./phone";
import { appOpen, clearTimer, live, onboarding, patchLive, runtime } from "./state";
import { addEvent, append, placePendingCard } from "./thread";
import { runTool } from "./tool-handlers";

/** On a call, this long without a word either way prompts a check-in. */
const SILENCE_MS = 45_000;

/**
 * Tools whose introducing line is the whole point - "I've put a card on your
 * phone", "calling your band now", "i'll nudge you tuesday evening". Asking for
 * another reply after them only buys a filler line. A response that called one
 * without saying anything still gets its reply. save_details is deliberately
 * not here: the line before it is usually just "Got it", and the real next
 * move comes after it.
 */
const SILENT_TOOLS: ReadonlySet<string> = new Set(["show_card", "start_call", "set_reminder", "graduate"]);
/** Saving a detail alongside one of those doesn't earn a second reply either. */
const BOOKKEEPING_TOOLS: ReadonlySet<string> = new Set(["save_details"]);

function contextFor(): SessionContext {
  const state = onboarding.get();
  return {
    profile: state.profile,
    gmail: state.gmail,
    calls: state.calls,
    graduated: state.graduated,
    appOpen: appOpen(),
    history: historyLines(state.thread),
  };
}

/**
 * Open a session on `surface`, told in one [event] why. `replyToReason: false`
 * is for a reason that only informs - the conversation has already moved.
 */
export function openSession(
  surface: Surface,
  reason?: string,
  { replyToReason = true }: { replyToReason?: boolean } = {},
): Promise<RealtimeSession | null> {
  const promise = connect(surface, reason, replyToReason);
  const attempt = { surface, promise };
  runtime.opening = attempt;
  void promise.finally(() => {
    if (runtime.opening === attempt) runtime.opening = null;
  });
  return promise;
}

async function connect(surface: Surface, reason: string | undefined, replyToReason: boolean): Promise<RealtimeSession | null> {
  const mine = ++runtime.generation;
  const previous = runtime.session;
  runtime.session = null;
  // A call can only be closed by another open if something went wrong upstream;
  // if it happens, it is still a call that ended, and gets recorded as one.
  if (previous?.surface === "band") finishCallRecord(previous, "hung_up");
  else previous?.close();
  patchLive({
    session: { surface, status: "connecting" },
    caption: null,
    ...(surface === "band" && { bandNotice: null }),
  });

  // Handlers can fire before `open` resolves - a connect that fails closes
  // itself on the way out. Until then there is no session to act for.
  let opened: RealtimeSession | null = null;
  const holdsConversation = () => opened !== null && opened === runtime.session;
  try {
    opened = await RealtimeSession.open(surface, contextFor(), {
      onUserText: (text) => onTranscript(surface, "user", text),
      onAssistantText: (text, cutOff) => onTranscript(surface, "assistant", text, cutOff),
      onToolCall: async (name, args, spoke) =>
        opened ? runTool(opened, surface, name, args, spoke) : { error: "This conversation has moved on." },
      silentTools: SILENT_TOOLS,
      bookkeepingTools: BOOKKEEPING_TOOLS,
      onSpeaking: (speaking) => {
        if (holdsConversation()) patchLive({ speaking });
      },
      onThinking: (thinking) => {
        if (holdsConversation()) patchLive({ thinking });
      },
      onEnded: (why) => {
        if (opened) onSessionEnded(opened, why);
      },
      onConnectionTrouble: (trouble) => {
        if (holdsConversation()) patchLive({ bandNotice: trouble ? "Reconnecting…" : null });
      },
      onMicrophoneLost: () => {
        if (opened) onMicrophoneLost(opened);
      },
    });
  } catch (error) {
    console.warn(`[conductor] couldn't open the ${surface} session:`, error);
    if (mine !== runtime.generation) return null;
    // This attempt is over: whatever the failure triggers must not queue behind it.
    runtime.opening = null;
    patchLive({ session: null });
    if (surface === "band") onCallFailed(error);
    else addEvent("Persona couldn't connect. Try again in a moment.");
    return null;
  }

  if (mine !== runtime.generation) {
    opened.close();
    return null;
  }
  runtime.session = opened;
  patchLive({ session: { surface, status: "live" } });
  if (surface === "band") {
    onboarding.set((state) => ({ ...state, callStartedAt: Date.now() }));
    runtime.callBaseline = progress();
    runtime.typedDuringCall = false;
    armSilenceCheck();
  }
  if (reason) opened.sendEvent(reason, replyToReason);
  // Anything that happened while this was connecting arrives now, in order.
  const queued = runtime.pendingEvents;
  runtime.pendingEvents = [];
  queued.forEach((event) => opened.sendEvent(event.text, event.respond));
  return opened;
}

/**
 * Tell whoever holds the conversation. If a session is connecting, the event
 * waits for it; if nothing is open and the event wants a reply, the app picks
 * it up - a reply that lands on another screen arrives as a banner.
 */
export function deliver(text: string, respond = true) {
  if (runtime.session) {
    runtime.session.sendEvent(text, respond);
    return;
  }
  if (runtime.opening) {
    runtime.pendingEvents.push({ text, respond });
    return;
  }
  if (respond) void openSession("app", text);
}

function onMicrophoneLost(owner: RealtimeSession) {
  if (owner !== runtime.session) return;
  patchLive({ bandNotice: "Your microphone stopped" });
  owner.sendEvent("Their microphone just stopped working, so you can't hear them any more. Say so in one short line and offer to carry on in the app, then end_call.");
}

/** Persona writes without em dashes; any that slip through become a comma. */
function withoutEmDashes(text: string): string {
  // Em dashes, the horizontal bar, and an en dash used as a dash (spaced) -
  // but not an en dash in a range like 6–7pm.
  return text.replace(/\s*[—―]\s*/g, ", ").replace(/\s+–\s+/g, ", ");
}

/** Two lines that differ only in case, spacing or punctuation are the same line. */
function sameLine(a: string, b: string): boolean {
  const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return normal(a) === normal(b);
}

function onTranscript(surface: Surface, role: "user" | "assistant", raw: string, cutOff = false) {
  const text = role === "assistant" ? withoutEmDashes(raw) + (cutOff && !raw.endsWith("…") ? "…" : "") : raw;
  // A follow-up turn after a tool sometimes says the line the turn before it
  // just said. Nobody should read the same sentence twice in a row.
  if (role === "assistant") {
    const recent = onboarding
      .get()
      .thread.filter((item): item is MessageItem => item.kind === "message" && item.role === "assistant" && item.via === surface)
      .slice(-2);
    if (recent.some((item) => sameLine(item.text, text))) {
      placePendingCard();
      return;
    }
  }
  // A waiting card goes above the person's reply, or right below Persona's line.
  if (role === "user") placePendingCard();
  append({ kind: "message", id: newId(), role, text, via: surface, at: Date.now() });
  if (role === "assistant") placePendingCard();
  if (role === "user") releaseHeldFinds(surface);
  if (surface === "band") {
    armSilenceCheck();
    patchLive({ caption: { role, text } });
    return;
  }
  if (role === "assistant" && !appOpen()) {
    patchLive({ unread: live.get().unread + 1 });
    showBanner(text);
  }
}

function onSessionEnded(ended: RealtimeSession, reason: EndReason) {
  if (runtime.session !== ended) return;
  runtime.session = null;
  patchLive({ session: null, speaking: false, thinking: false });
  if (ended.surface !== "band") return;
  // Nobody here closed it (those paths clear `session` first), so the call
  // ended underneath the person: a dropped connection, or the voice session's
  // own limit. Either way the app says so rather than going quiet.
  finishCallRecord(ended, reason === "dropped" ? "dropped" : "hung_up");
  deliver(
    backInApp(
      reason === "dropped"
        ? "The call on the band dropped unexpectedly. Say you got cut off in a few words, and offer to pick up here or call back."
        : "The call on the band ended on its own - the voice session closed. Say so in a few words and offer to carry on here or call back.",
    ),
  );
}

/** Nobody has said anything on the call for a while: Persona checks in once. */
function armSilenceCheck() {
  clearTimer(runtime.silenceTimer);
  const owner = runtime.session;
  if (owner?.surface !== "band") return;
  runtime.silenceTimer = setTimeout(() => {
    if (owner !== runtime.session) return;
    owner.sendEvent("Nobody has said anything for a while. Ask once, briefly, if they're still there. If there's no answer, say a short goodbye and call end_call with reason done.");
  }, SILENCE_MS);
}
