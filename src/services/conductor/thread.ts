import { newId, type CallOutcome, type CardItem, type ThreadItem } from "@/domain/onboarding";
import { showBanner } from "./phone";
import { onboarding, runtime } from "./state";

/** How long a card waits for the line that introduces it before it goes in anyway. */
const CARD_LINE_WAIT_MS = 6_000;

export function append(item: ThreadItem) {
  onboarding.set((state) => ({ ...state, thread: [...state.thread, item] }));
}

export function addEvent(text: string) {
  append({ kind: "event", id: newId(), text, at: Date.now() });
}

/** Something from the user in the app, typed or tapped. A card waiting for its line goes above it. */
export function addUserMessage(text: string): string {
  placePendingCard();
  const id = newId();
  append({ kind: "message", id, role: "user", text, via: "app", at: Date.now() });
  return id;
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function recordCall(outcome: CallOutcome, seconds: number) {
  const text: Record<CallOutcome, string> = {
    completed: `Call on the band · ${formatDuration(seconds)}`,
    hung_up: `Call ended · ${formatDuration(seconds)}`,
    dropped: `Call dropped · ${formatDuration(seconds)}`,
    declined: "Declined call",
    missed: "Missed call",
  };
  onboarding.set((state) => ({
    ...state,
    callStartedAt: null,
    calls: [...state.calls, { outcome, at: Date.now(), seconds }],
  }));
  addEvent(text[outcome]);
}

export function placeCard(item: CardItem, banner: string) {
  append(item);
  showBanner(banner);
}

/** Hold a card until Persona's next line (or the person's next message), so the words come first. */
export function placeCardAfterNextLine(item: CardItem, banner: string) {
  placePendingCard();
  runtime.pendingCard = { item, banner, timer: setTimeout(placePendingCard, CARD_LINE_WAIT_MS) };
}

export function placePendingCard() {
  if (!runtime.pendingCard) return;
  const { item, banner, timer } = runtime.pendingCard;
  runtime.pendingCard = null;
  clearTimeout(timer);
  placeCard(item, banner);
}
