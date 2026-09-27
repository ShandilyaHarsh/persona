import { INITIAL_STATE, parseSaved } from "@/domain/onboarding";
import { parsePersisted, readPersisted } from "@/lib/store";
import { backInApp, stopRinging } from "./calls";
import { armInboxScan, deliverFindsIfReady, holdFinds } from "./inbox";
import { armReminder } from "./reminders";
import { deliver } from "./sessions";
import { clearTimer, INITIAL_LIVE, live, onboarding, runtime, STORAGE_KEY } from "./state";
import { recordCall } from "./thread";

let hydrated = false;

/** Read the saved record once. Safe to call again (Fast Refresh): it only runs the first time. */
export function hydrate() {
  if (hydrated) return;
  hydrated = true;
  window.addEventListener("storage", adoptOtherTab);

  const saved = parseSaved(readPersisted(STORAGE_KEY));
  if (!saved) return;
  onboarding.set(saved);

  // A call still marked open means the page went away mid-call.
  if (saved.callStartedAt) {
    recordCall("dropped", Math.round((Date.now() - saved.callStartedAt) / 1000));
    deliver(backInApp("The call on the band dropped when the page reloaded. Say you got cut off in a few words, and offer to pick up here or call back."));
  }
  // A ring that was still going when the page went away went unanswered.
  if (saved.personaRingingSince) {
    onboarding.set((state) => ({ ...state, personaRingingSince: null }));
    recordCall("missed", 0);
    deliver("Your call to their band went unanswered. Carry on here in the app; don't call again unless they ask.");
  }
  for (const item of onboarding.get().thread) {
    if (item.kind === "reminder" && !item.fired) armReminder(item.id, item.task, item.firesAt);
    if (item.kind === "inbox_scan" && !item.done) armInboxScan(item.id, item.readyAt);
    if (item.kind === "inbox_scan" && item.done && !item.delivered) holdFinds();
  }
  deliverFindsIfReady(true);
}

/**
 * Another tab wrote the record. Take its version rather than overwrite it with
 * ours on the next change - two tabs shouldn't erase each other's threads.
 */
function adoptOtherTab(event: StorageEvent) {
  if (event.key !== STORAGE_KEY || event.newValue === null) return;
  // An unreadable write is reported by the parsers; ours stays until a good one arrives.
  const state = parseSaved(parsePersisted(STORAGE_KEY, event.newValue));
  if (state) onboarding.adopt(state);
}

export function reset() {
  runtime.generation++;
  const closing = runtime.session;
  runtime.session = null;
  runtime.opening = null;
  closing?.close();
  runtime.pendingEvents = [];
  stopRinging();
  runtime.pendingTimers.forEach((timer) => clearTimeout(timer));
  runtime.pendingTimers.clear();
  [runtime.bannerTimer, runtime.buzzTimer, runtime.silenceTimer, runtime.findsFallbackTimer].forEach(clearTimer);
  runtime.bannerTimer = runtime.buzzTimer = runtime.silenceTimer = runtime.findsFallbackTimer = null;
  runtime.callBaseline = null;
  runtime.typedDuringCall = false;
  runtime.lastCallEndedAt = 0;
  runtime.inboxFindsHeld = false;
  if (runtime.pendingCard) clearTimeout(runtime.pendingCard.timer);
  runtime.pendingCard = null;
  onboarding.set(INITIAL_STATE);
  live.set(INITIAL_LIVE);
}
