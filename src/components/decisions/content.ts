/**
 * What the decisions page says. Kept apart from how it looks so the thinking
 * can be edited without touching layout - and every line here describes what
 * the prototype actually does, not what it might.
 */

export type Verdict = "chosen" | "dropped" | "rejected";

export type Option = { verdict: Verdict; title: string; reason: string };

export type Branch = { if: string; then: string };

export type Step = {
  id: string;
  number: string;
  title: string;
  summary: string;
  moment: string;
  branches: Branch[];
  options: Option[];
};

export const BRIEF =
  "Collect a name for the assistant, the user's name, a connected Gmail, and something they could use help with. Conversational, not a form. Try a call for everything but the agent's name. Withstand anything a person might do.";

export const PRINCIPLES = [
  { title: "Value before questions", body: "Show something useful as early as possible, with as few questions as possible. Suggest, don't ask." },
  { title: "One conversation, two places", body: "Text in the app, talk on the Band. One shared record, so either can pick up mid-thought." },
  { title: "Nothing blocks", body: "Every step is skippable, every card can be answered in words, every hang-up is expected." },
];

export const STEPS: Step[] = [
  {
    id: "start",
    number: "0",
    title: "First contact",
    summary: "Start in the app or on the Band",
    moment: "Someone meets Persona for the first time - either by opening the app, or by pressing the ring on their Band.",
    branches: [
      { if: "They open the app", then: "Persona texts first, one line, and shows name ideas as a card." },
      { if: "They press the Band first", then: "A call starts; Persona says hi and asks what to call it, by voice. The app shows everything said." },
      { if: "They do nothing", then: "The home screen shows a notification and a badge on the app - an invitation, not a prompt loop." },
    ],
    options: [
      { verdict: "chosen", title: "The app and the Band, one shared record", reason: "Either can start; neither is the 'main' one. Every session is built from the same record, so switching never loses context." },
      { verdict: "dropped", title: "iMessage as a third place", reason: "Built first. Two text surfaces split attention, and a text thread can't host cards - Gmail needed a separate 'secure vault link' just to exist there." },
      { verdict: "rejected", title: "App-only onboarding", reason: "Ignores the Band, which is where the brief's call should live, and the device a new owner is most curious about." },
    ],
  },
  {
    id: "name",
    number: "1",
    title: "Its name",
    summary: "Four everyday names, or type one",
    moment: "The first thing Persona asks is what to call it - the one detail the brief says to settle outside the call.",
    branches: [
      { if: "They tap a name", then: "Saved; the card settles to 'You named me Ava'." },
      { if: "They type their own", then: "Saved; the name card settles on its own so it can't be tapped into a contradiction later." },
      { if: "They type a joke or a test (\"asdf\")", then: "One light jab, then if they insist, it's their call." },
      { if: "They say it on a call", then: "Saved by voice; the app shows it." },
    ],
    options: [
      { verdict: "chosen", title: "Four fixed, everyday names: Ava, Leo, Maya, Sam", reason: "It should feel like meeting a person, not naming a product." },
      { verdict: "dropped", title: "Names invented by the model", reason: "Drifted to 'Sparrow', 'Pip', 'Ember' - whimsical in a way that made the assistant feel like a toy." },
      { verdict: "dropped", title: "Name plus a voice picker with spoken samples", reason: "Built and working, then cut: an extra step before any value, and the voice is less important than getting to something useful." },
    ],
  },
  {
    id: "call",
    number: "2",
    title: "Their name, and the call",
    summary: "Offer a call on the Band",
    moment: "Once the name is settled, Persona asks if it can call - the brief wants a call for everything after the name.",
    branches: [
      { if: "They say yes", then: "The Band lights up and vibrates three times. One press answers; the call picks up mid-thought from the app." },
      { if: "They'd rather keep typing", then: "No push - everything else works in text too." },
      { if: "They let it ring (25s)", then: "Logged as missed. Persona carries on in the app and doesn't call again unless asked." },
      { if: "They press twice while it rings", then: "Logged as declined; same as missed, no guilt." },
      { if: "They want to move to a call later", then: "Continue on band, beside the app's message field, rings the Band; pressing it starts the call." },
      { if: "The microphone is blocked", then: "The Band says so; the app carries on and explains how to allow it." },
    ],
    options: [
      { verdict: "chosen", title: "The call lives on the Band only", reason: "A single physical button makes a call feel like picking up. One voice surface means no question of where to talk." },
      { verdict: "dropped", title: "A phone-call screen on the iPhone", reason: "Built first. It duplicated the Band and made the wearable feel optional." },
      { verdict: "dropped", title: "Voice mode inside the app", reason: "Built, then removed - a second way to talk to the same assistant, and the Band stopped mattering." },
      { verdict: "dropped", title: "Double-press to move a call back to the app", reason: "Removed: calls only happen on the Band. Saying \"let's just text\" ends the call and the app picks up instead." },
    ],
  },
  {
    id: "gmail",
    number: "3",
    title: "Gmail",
    summary: "Right after the names",
    moment: "The moment Persona knows both names, it asks to connect Gmail - framed as getting started, because everything useful depends on it.",
    branches: [
      { if: "They connect", then: "A secure sign-in page opens (simulated, prefilled with a demo account). Persona starts reading the inbox immediately." },
      { if: "They tap Not now, or say no", then: "One line of \"no worries\", then straight into asking about their day - yesterday, then open loops, then a goal - stopping at the first answer Persona can act on, so value still comes fast. Gmail isn't raised again unless a request needs it." },
      { if: "They try to type a password", then: "Persona stops them and points to the card. Credentials never enter the conversation." },
      { if: "They ignore it", then: "The card stays tappable; the conversation moves on. Cards never block." },
      { if: "They're on a call", then: "The card lands in the app (with a banner if it's closed); Persona says it's on their phone." },
    ],
    options: [
      { verdict: "chosen", title: "Ask right after the names", reason: "Every later step becomes concrete - real things from their life instead of hypotheticals." },
      { verdict: "dropped", title: "Ask after learning what they need", reason: "Tried. Persona went hunting for a goal, stalled on 'idk', and only raised Gmail after the call had ended." },
      { verdict: "dropped", title: "A secure vault link sent over iMessage", reason: "Right answer for a text thread that can't host a sign-in; went away with iMessage." },
    ],
  },
  {
    id: "scan",
    number: "4a",
    title: "While the inbox is read",
    summary: "Used an agent before?",
    moment: "Reading the inbox takes a few seconds. Persona spends them on the one question that decides what comes next.",
    branches: [
      { if: "They've used Muse, Instinct or Poke", then: "They know what an agent can do - skip discovery. The inbox finds come the moment they're ready." },
      { if: "They haven't", then: "Persona asks about their day. The finds arrive together with that answer, alongside anything the day suggests." },
      { if: "The scan finishes before they answer", then: "The finds wait for the answer instead of landing on top of an open question." },
      { if: "They never answer clearly", then: "The finds go out after three turns anyway - they can't get stuck." },
      { if: "They reload mid-scan", then: "The scan resumes from where the record left it." },
    ],
    options: [
      { verdict: "chosen", title: "The agent question as a routing signal", reason: "Experienced users go straight to value; newcomers get discovery during time they'd otherwise spend waiting." },
      { verdict: "dropped", title: "Show the finds the instant the scan ends", reason: "Tried. They landed on top of an unanswered question and the conversation lost its thread." },
      { verdict: "dropped", title: "A card to paste what another assistant knows", reason: "Built, then cut. Another step - and the useful signal wasn't their data, it was whether they already know what agents do." },
    ],
  },
  {
    id: "day",
    number: "4b",
    title: "No Gmail: a day, not needs",
    summary: "Yesterday, open loops, a goal",
    moment: "Without an inbox, Persona still has to find something real to act on - asking as little as possible.",
    branches: [
      { if: "They tell a story", then: "Persona pulls two or three tasks out of what they actually said and offers them as a card." },
      { if: "They say \"idk\"", then: "One easier follow-up: what took longest, or what they put off. Never the same question twice." },
      { if: "Still nothing", then: "Next question: anything hanging over you? Then: any goal - health, work, life? It stops at the first answer it can act on." },
    ],
    options: [
      { verdict: "chosen", title: "Ask about a day, one question at a time", reason: "People can't list their needs, but they can tell a story - and a story holds the tasks." },
      { verdict: "dropped", title: "\"What would you like help with?\"", reason: "Tried. Got 'idk' and a menu of generic suggestions. It puts the work on the user." },
    ],
  },
  {
    id: "choose",
    number: "5",
    title: "Where to start",
    summary: "Tap a suggestion",
    moment: "Persona offers specific things it can take on - from the inbox or from their day. What they pick becomes the goal.",
    branches: [
      { if: "They're in the app", then: "A card of options to tap. Inbox finds are badged Demo." },
      { if: "They're on a call", then: "Persona names the three and asks which to tackle." },
      { if: "They ask for something else", then: "That becomes the goal - the suggestions are a start, not a menu." },
    ],
    options: [
      { verdict: "chosen", title: "Inbox finds as a fixed card; day tasks written by Persona", reason: "The inbox card is exact and clearly a demo; tasks from a story need the model's judgement." },
      { verdict: "dropped", title: "A separate card just listing the inbox", reason: "Showed what was there without offering to act on it - information, not value." },
    ],
  },
  {
    id: "act",
    number: "6",
    title: "A first real task",
    summary: "The Band buzzes",
    moment: "From what they picked, Persona sets one small thing - \"I'll nudge you at 6 to reply to your landlord\" - and does it.",
    branches: [
      { if: "It comes due", then: "The Band buzzes (three pulses, ring lit), the app shows it, and Persona offers to help right then. Time is compressed to ~20s in the demo, and labelled." },
      { if: "They press the Band", then: "The buzz is dismissed." },
      { if: "They're on a call when it fires", then: "It still buzzes, and Persona mentions it in the conversation." },
      { if: "They reload before it fires", then: "It's re-armed from the record." },
    ],
    options: [
      { verdict: "chosen", title: "Act during onboarding", reason: "Seeing Persona do something on the wrist is what makes the value believable." },
      { verdict: "rejected", title: "Promise to help later", reason: "Every assistant promises. Few prove it in the first two minutes." },
    ],
  },
  {
    id: "done",
    number: "7",
    title: "Done, quietly",
    summary: "No finish line",
    moment: "Onboarding ends when there's something real underway - and the user never sees a 'complete' screen.",
    branches: [
      { if: "Everything's collected", then: "Persona marks onboarding done and just keeps being useful." },
      { if: "Something was declined", then: "It stays declined; Persona fills it only if a request needs it." },
    ],
    options: [
      { verdict: "chosen", title: "Invisible graduation", reason: "Completing onboarding isn't an event for the user - getting help is." },
      { verdict: "dropped", title: "A \"You're all set\" summary card", reason: "Built, then removed. It landed in the middle of the conversation, after the tasks, as if onboarding had just ended." },
    ],
  },
];

/* ─── The call as a state machine ─────────────────────────── */

export type CallState = {
  id: string;
  title: string;
  looks: string;
  exits: Array<{ on: string; to: string }>;
};

export const CALL_STATES: CallState[] = [
  {
    id: "idle",
    title: "Idle",
    looks: "Ring faint",
    exits: [
      { on: "Persona asks, they agree", to: "Ringing" },
      { on: "Continue on band, in the app", to: "Ringing" },
      { on: "They press the ring", to: "Connecting" },
    ],
  },
  {
    id: "ringing",
    title: "Ringing",
    looks: "Ring lit · three vibrations",
    exits: [
      { on: "Press", to: "Connecting" },
      { on: "Press twice", to: "Declined" },
      { on: "25 seconds", to: "Missed" },
    ],
  },
  {
    id: "connecting",
    title: "Connecting",
    looks: "An arc runs the ring",
    exits: [
      { on: "Connected", to: "Live" },
      { on: "Microphone blocked", to: "Back to the app" },
      { on: "Network fails", to: "Back to the app" },
    ],
  },
  {
    id: "live",
    title: "Live",
    looks: "Ring pulses with the voices",
    exits: [
      { on: "They press", to: "Hung up" },
      { on: "Persona wraps up", to: "Completed" },
      { on: "\"Let's just text\"", to: "Back to the app" },
      { on: "Connection drops, or the page reloads", to: "Dropped" },
    ],
  },
];

export const AFTER_A_CALL: Branch[] = [
  { if: "The call moved something - a detail, a card, or they simply spoke", then: "The app sends one message with the next step. No recap." },
  { if: "Nothing happened", then: "Silence. A message after a call that went nowhere is noise." },
  { if: "It dropped", then: "Always a short \"we got cut off\" - that's the one ending nobody chose." },
  { if: "A question is still on screen, unanswered", then: "Persona doesn't ask it again - it's already there." },
  { if: "Declined or missed", then: "Persona continues in the app and doesn't call again unless asked." },
];

/* ─── Moving between the two ──────────────────────────────── */

/** Only the rules that aren't obvious - each is something we had to decide. */
export const MOVES: Array<{ rule: string; detail: string }> = [
  {
    rule: "A call picks up mid-thought",
    detail: "Every session is rebuilt from the shared record, so moving from the app to the Band never re-greets or recaps - Persona carries on from the last thing said.",
  },
  {
    rule: "Typing during a call joins the call",
    detail: "Not a second conversation running in parallel. Persona hears it and answers aloud.",
  },
  {
    rule: "A reload is a dropped call, not a lost one",
    detail: "The record survives. An open call is logged as dropped and followed up; an inbox scan or a reminder in flight picks up where it was.",
  },
];
