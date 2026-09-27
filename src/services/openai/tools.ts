import { CARD_KINDS, type Surface } from "@/domain/onboarding";

/**
 * The tool belt each surface is minted with.
 *
 * The belts differ on purpose: the app can ring the band but has no call to
 * end, and a call on the band can end itself but has no reason to ring.
 * Handing a model a tool it must never use is an invitation to use it.
 */

type Tool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const saveDetails: Tool = {
  type: "function",
  name: "save_details",
  description:
    "Save anything you just learned, the moment you learn it. You get a turn right after to say your next line. Call again to correct a value the user changes. Never invent values.",
  parameters: {
    type: "object",
    properties: {
      agent_name: { type: "string", description: "What the user wants to call you." },
      user_name: { type: "string", description: "What the user wants to be called." },
      help_with: {
        type: "string",
        description: "One sentence, in the user's terms, of what they want help with.",
      },
      used_agents: {
        type: "boolean",
        description: "Their answer to whether they've used a personal agent before (Muse, Instinct, Poke).",
      },
      gmail_declined: {
        type: "boolean",
        description: "True when they say no to connecting Gmail in words rather than on the card.",
      },
    },
    additionalProperties: false,
  },
};

const showCard: Tool = {
  type: "function",
  name: "show_card",
  description:
    "Put a card in the Persona app. Say one short sentence about it first. Returns straight away; what the user does with it arrives later as an [event]. " +
    "name_agent: a few everyday names to tap (they're fixed - don't list them yourself). " +
    "connect_gmail: the only way to connect Gmail - it opens a secure sign-in page; never ask for an address or password in the conversation. " +
    "task_options: two or three concrete tasks you drew out of what they told you, as cards they can tap.",
  parameters: {
    type: "object",
    properties: {
      card: { type: "string", enum: CARD_KINDS },
      user_asked: {
        type: "boolean",
        description: "True only when the user asked for this card - needed to show Gmail again after they declined it.",
      },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        description: "task_options only: two or three specific tasks, each from something they actually said.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "A few words, as an action: \"Reply to your landlord\"." },
            detail: { type: "string", description: "One short line of how you'd do it." },
          },
          required: ["title", "detail"],
          additionalProperties: false,
        },
      },
    },
    required: ["card"],
    additionalProperties: false,
  },
};

const setReminder: Tool = {
  type: "function",
  name: "set_reminder",
  description:
    "Set a first small, real task from what you learned - a nudge at a specific time (\"I'll nudge you at 6 to reply to your landlord\"). Say the one line announcing it in the same turn as this call - nothing before, nothing after. Their band buzzes when it's due. One per onboarding; setting it also finishes onboarding.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string", description: "What to nudge them about, in a few words." },
      when: { type: "string", description: "The time, as you'd say it: \"6:00 PM\", \"tomorrow 9 AM\"." },
    },
    required: ["task", "when"],
    additionalProperties: false,
  },
};

const startCall: Tool = {
  type: "function",
  name: "start_call",
  description:
    "Call the user on their Persona Band: it lights up and they press it to answer. Only after they have agreed to a call, or asked for one. Returns immediately; you will hear how it went as an [event].",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

const endCall: Tool = {
  type: "function",
  name: "end_call",
  description:
    "Hang up the band call, after a short goodbye. Use when the call has done its job, or the user wants to stop or switch to messaging.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", enum: ["done", "user_wants_to_type", "user_wants_to_stop"] },
    },
    required: ["reason"],
    additionalProperties: false,
  },
};

const redactLastMessage: Tool = {
  type: "function",
  name: "redact_last_message",
  description:
    "If the user's last message contains a password, code or other secret, call this straight away to remove it from their conversation. Then tell them kindly never to share it here.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

const graduate: Tool = {
  type: "function",
  name: "graduate",
  description:
    "Finish onboarding and move the user into the main experience. When everything is collected or declined - or earlier, only if they want to get going and you know what they need.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

const BELTS: Record<Surface, Tool[]> = {
  app: [saveDetails, showCard, setReminder, startCall, redactLastMessage, graduate],
  band: [saveDetails, showCard, setReminder, endCall, redactLastMessage, graduate],
};

export function toolsFor(surface: Surface): Tool[] {
  return BELTS[surface];
}
