import { DEMO_INBOX, INBOX_SCAN_SECONDS } from "@/domain/demo";
import { isUserMessage, newId, type CardItem, type Surface } from "@/domain/onboarding";
import { deliver } from "./sessions";
import { clearTimer, onboarding, onCall, runtime, schedulePending } from "./state";
import { append, placeCardAfterNextLine } from "./thread";

/** However the agents question goes, the inbox finds never wait longer than this many answers... */
const MAX_TURNS_BEFORE_FINDS = 3;
/** ...or this long, for someone who has gone quiet. */
const MAX_WAIT_BEFORE_FINDS_MS = 60_000;

/**
 * Going through the inbox takes a moment, and Persona spends it on the one
 * question that decides what comes next: has this person used an agent before?
 * When the scan finishes, the finds go to whoever holds the conversation - a
 * card to tap in the app, three things named out loud on a call.
 */
export function startInboxScan() {
  if (onboarding.get().thread.some((item) => item.kind === "inbox_scan")) return;
  const id = newId();
  const readyAt = Date.now() + INBOX_SCAN_SECONDS * 1000;
  append({ kind: "inbox_scan", id, readyAt, done: false, delivered: false, at: Date.now() });
  armInboxScan(id, readyAt);
}

export function armInboxScan(id: string, readyAt: number) {
  schedulePending(id, readyAt, () => finishInboxScan(id));
}

function finishInboxScan(id: string) {
  onboarding.set((state) => ({
    ...state,
    thread: state.thread.map((item) => (item.kind === "inbox_scan" && item.id === id ? { ...item, done: true } : item)),
  }));
  holdFinds();
  deliverFindsIfReady(true);
}

/** The finds are ready but waiting for the right moment - never longer than a minute. */
export function holdFinds() {
  runtime.inboxFindsHeld = true;
  clearTimer(runtime.findsFallbackTimer);
  runtime.findsFallbackTimer = setTimeout(() => {
    runtime.findsFallbackTimer = null;
    if (!runtime.inboxFindsHeld) return;
    runtime.inboxFindsHeld = false;
    deliverInboxFinds(true);
  }, MAX_WAIT_BEFORE_FINDS_MS);
}

/**
 * When the finds go out depends on who they're talking to. Someone who has used
 * an agent before gets them straight away. Someone who hasn't answers one
 * question about their day first, and gets the finds with that answer - so
 * discovery happens while the inbox is being read, not instead of it. If the
 * question never gets a clear answer, the finds go out after a few turns or a
 * minute rather than never.
 */
export function deliverFindsIfReady(respond: boolean) {
  if (!runtime.inboxFindsHeld) return;
  const { thread, agents } = onboarding.get();
  const scan = thread.find((item) => item.kind === "inbox_scan");
  const userTurnsSince = (at: number) =>
    thread.filter((item) => isUserMessage(item) && item.at > at).length;
  const ready =
    agents?.used === true ||
    (agents?.used === false && userTurnsSince(agents.at) >= 1) ||
    (scan !== undefined && userTurnsSince(scan.at) >= MAX_TURNS_BEFORE_FINDS);
  if (!ready) return;
  runtime.inboxFindsHeld = false;
  clearTimer(runtime.findsFallbackTimer);
  runtime.findsFallbackTimer = null;
  deliverInboxFinds(respond);
}

/**
 * Their answer arrived: anything waiting on it goes out alongside it. In the
 * app the typed message asks for the reply; on the band the reply may already
 * be under way, so the finds ask for their own - queued behind it, not over it.
 */
export function releaseHeldFinds(surface: Surface) {
  deliverFindsIfReady(surface === "band");
}

function demoInboxCard(): CardItem {
  return {
    kind: "card",
    id: newId(),
    card: "task_options",
    source: "demo_inbox",
    options: DEMO_INBOX.signals.map((signal) => ({ title: signal.title, detail: signal.subject })),
    at: Date.now(),
  };
}

function markFindsDelivered() {
  onboarding.set((state) => ({
    ...state,
    thread: state.thread.map((item) => (item.kind === "inbox_scan" ? { ...item, delivered: true } : item)),
  }));
}

/**
 * The finds go to whoever holds the conversation: a card to tap in the app,
 * three things named out loud on a call. When they ride along with the user's
 * own message, that message already asks for the reply.
 */
function deliverInboxFinds(respond: boolean) {
  const onBand = onCall();
  if (!onBand) {
    placeCardAfterNextLine(demoInboxCard(), "Found a few things I can take off your plate");
  }
  markFindsDelivered();
  const found = DEMO_INBOX.signals.map((signal) => `- ${signal.subject} (you could offer: "${signal.offer}")`).join("\n");
  deliver(
    `You finished going through their demo inbox. It's a demo inbox - say so once, never call it their real mail. Found:\n${found}\n` +
      (onBand
        ? "Name the three in a few words each and ask which one they want you to tackle."
        : "The three are on their screen as a card to tap - one short line pointing to it, no list.") +
      " If they've used a personal agent before, go straight to these. If they haven't, they've just told you about their day: these three are already on screen, so don't repeat them in another card - add at most one thing their day suggests, in a single line. Either way, don't ask what they need, and add that they can ask for anything else.",
    respond,
  );
}

/**
 * Finds spoken on a call exist only in the transcript. When the call ends
 * before one is picked, they come back as a card, so they can still be tapped.
 */
export function surfaceSpokenFinds() {
  const thread = onboarding.get().thread;
  const spoken = thread.some((item) => item.kind === "inbox_scan" && item.delivered);
  const carded = thread.some((item) => item.kind === "card" && item.source === "demo_inbox");
  const chosen = Boolean(onboarding.get().profile.helpWith);
  if (spoken && !carded && !chosen) append(demoInboxCard());
}
