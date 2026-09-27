import type { CardItem, CardKind, CardResult } from "@/domain/onboarding";
import { startInboxScan } from "./inbox";
import { deliver } from "./sessions";
import { live, onboarding, patchLive } from "./state";
import { addUserMessage } from "./thread";

/** What the phone's banner says when a card lands while the app is closed. */
export const CARD_BANNERS: Record<CardKind, string> = {
  name_agent: "Pick a name for me",
  connect_gmail: "Tap to connect your Gmail",
  task_options: "A few things I could take off your plate",
};

export function openCards(kind: CardKind): CardItem[] {
  return onboarding.get().thread.filter((item): item is CardItem => item.kind === "card" && item.card === kind && !item.result);
}

export function settleCards(ids: string[], result: CardResult) {
  if (ids.length === 0) return;
  onboarding.set((state) => ({
    ...state,
    thread: state.thread.map((entry) => (entry.kind === "card" && ids.includes(entry.id) ? { ...entry, result } : entry)),
  }));
}

export function completeCard(id: string, result: CardResult) {
  const item = onboarding.get().thread.find((entry): entry is CardItem => entry.kind === "card" && entry.id === id);
  if (!item || item.result) return;

  onboarding.set((state) => ({
    ...state,
    thread: state.thread.map((entry) => {
      if (entry.kind !== "card") return entry;
      if (entry.id === id) return { ...entry, result };
      // One goal: picking an option closes any other card of options.
      if (result.status === "picked" && entry.card === "task_options" && !entry.result) {
        return { ...entry, result: { status: "dismissed" as const } };
      }
      return entry;
    }),
    profile: {
      ...state.profile,
      ...(result.status === "connected" && { gmail: result.email }),
      ...(result.status === "chosen" && { agentName: result.name }),
      ...(result.status === "picked" && { helpWith: `${result.task.title} - ${result.task.detail}` }),
    },
    gmail:
      item.card !== "connect_gmail"
        ? state.gmail
        : result.status === "connected"
          ? "connected"
          : result.status === "declined"
            ? "declined"
            : state.gmail,
  }));
  patchLive({ consentFor: null });
  // A tap is an answer like any other: it shows on their side of the
  // conversation, and the card - its job done - leaves the thread.
  const said = answerText(result);
  if (said) addUserMessage(said);
  if (result.status === "connected") startInboxScan();

  // Tell whoever holds the conversation now - the session that raised the
  // card, the one it has since moved to, or the one about to open.
  deliver(cardEvent(item.card, result), result.status !== "dismissed");
}

/** What a tap on a card says, in the user's own words. Closing a card says nothing. */
function answerText(result: CardResult): string | null {
  switch (result.status) {
    case "chosen":
      return result.name;
    case "connected":
      return `Connected ${result.email}`;
    case "picked":
      return result.task.title;
    case "declined":
      return "Not now";
    case "dismissed":
      return null;
  }
}

function cardEvent(card: CardKind, result: CardResult): string {
  switch (result.status) {
    case "chosen":
      return onboarding.get().profile.userName
        ? `The user named you "${result.name}". Take it warmly in a few words and carry on.`
        : `The user named you "${result.name}". Take it warmly in a few words, then ask what to call them. Their name comes before anything else, Gmail included.`;
    case "connected":
      return `The user connected Gmail (${result.email}). You've started going through their demo inbox - it takes a moment, and you'll get an [event] when it's done. Meanwhile, ask whether they've used a personal agent before, like muse, instinct or poke.`;
    case "picked":
      return `The user picked "${result.task.title}" (${result.task.detail}). In one short line, say what you'll nudge them about and when ("i'll nudge you tuesday evening to check in"), and call set_reminder in the same turn. That line is the only announcement - nothing before it, nothing after.`;
    case "declined":
      return "The user tapped Not now on the Gmail card. One line of no worries, then the no-Gmail path: walk me through yesterday.";
    case "dismissed":
      return `The user closed the ${card} card without using it${card === "name_agent" ? " - they'll type a name instead" : ""}.`;
  }
}

export function openConsent(cardId: string) {
  patchLive({ consentFor: cardId });
}

/** They opened the Gmail sign-in and backed out without deciding. */
export function cancelConsent() {
  if (!live.get().consentFor) return;
  patchLive({ consentFor: null });
  deliver("The user opened the Gmail sign-in and backed out without connecting. Don't push: one short line saying it's fine to skip it for now, and carry on.");
}
