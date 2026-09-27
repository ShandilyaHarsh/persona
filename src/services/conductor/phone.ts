import { newId } from "@/domain/onboarding";
import { CARD_BANNERS } from "./cards";
import { releaseHeldFinds } from "./inbox";
import { openSession } from "./sessions";
import { appOpen, callConnecting, clearTimer, onboarding, onCall, patchLive, runtime } from "./state";
import { addUserMessage, append, placeCard } from "./thread";

const BANNER_MS = 5_000;
const FIRST_GREETING = "hi, welcome. what should i call you? here are a few ideas.";

function agentLabel(): string {
  return onboarding.get().profile.agentName ?? "Persona";
}

export function showBanner(body: string) {
  if (appOpen()) return;
  clearTimer(runtime.bannerTimer);
  patchLive({ banner: { id: newId(), title: agentLabel(), body } });
  runtime.bannerTimer = setTimeout(() => patchLive({ banner: null }), BANNER_MS);
}

export function openPersonaApp() {
  patchLive({ phoneScreen: "persona", banner: null, unread: 0 });
  if (onboarding.get().thread.length === 0 && !runtime.session && !runtime.opening) greetFirstOpen();
}

/**
 * The first open greets instantly instead of waiting seconds for a session to
 * mint and the model to write a hello. The greeting and the name card are
 * fixed, so the session opens behind them already knowing both (they're in
 * the history it's minted with) and waits for the answer. Anything they type
 * or tap meanwhile queues behind the connect, like any other event.
 */
function greetFirstOpen() {
  append({ kind: "message", id: newId(), role: "assistant", text: FIRST_GREETING, via: "app", at: Date.now() });
  placeCard({ kind: "card", id: newId(), card: "name_agent", at: Date.now() }, CARD_BANNERS.name_agent);
  void openSession(
    "app",
    "You've already greeted them in the app and shown the name card (name ideas). Wait for their answer; say nothing now.",
    { replyToReason: false },
  );
}

export function goHome() {
  patchLive({ phoneScreen: "home" });
}

/** Typed in the app. During a call it joins the call; otherwise it's messaging. */
export async function sendText(text: string) {
  // A typed "[event]" would read as the system talking.
  const trimmed = text.trim().replace(/^\[event\]\s*/i, "");
  if (!trimmed) return;
  const id = addUserMessage(trimmed);
  if (onCall() || callConnecting()) runtime.typedDuringCall = true;

  if (!runtime.session && runtime.opening) await runtime.opening.promise;
  // Reset while we waited: the message is gone, and so is the conversation.
  if (!onboarding.get().thread.some((item) => item.id === id)) return;
  // Whatever holds the conversation *now* - the connect we waited on may have
  // been cancelled or superseded while we waited.
  if (!runtime.session && runtime.opening) {
    runtime.pendingEvents.push({ text: `The user typed: "${trimmed}"`, respond: true });
    return;
  }
  const target = runtime.session ?? (await openSession("app"));
  if (!target || target !== runtime.session) return;
  releaseHeldFinds("app");
  target.sendUserText(trimmed);
}

/** How loud each side of the call is right now, 0..1, for anything that visualises voice. */
export function voiceLevels(): { input: number; output: number } {
  if (!onCall() || !runtime.session) return { input: 0, output: 0 };
  return { input: runtime.session.level("input"), output: runtime.session.level("output") };
}
