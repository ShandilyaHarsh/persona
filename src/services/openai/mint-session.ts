import type { SessionContext, Surface } from "@/domain/onboarding";
import { buildInstructions } from "@/services/openai/prompt";
import { toolsFor } from "@/services/openai/tools";

/**
 * Minting short-lived OpenAI Realtime credentials.
 *
 * The browser negotiates WebRTC directly with OpenAI, so audio never passes
 * through this server. What it needs from us is a single-use client secret and
 * a session configuration it cannot tamper with.
 */

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
/** Consumed by the SDP exchange that follows within a second or two. */
const CLIENT_SECRET_TTL_SECONDS = 60;

// Overridable per deployment without a code change; these are the defaults it ships with.
const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-transcribe";

type MintedSession = { clientSecret: string; model: string };

function buildSession(surface: Surface, context: SessionContext) {
  const voice = surface === "band";
  return {
    type: "realtime",
    model: MODEL,
    output_modalities: [voice ? "audio" : "text"],
    // Thinking is silence the person has to sit through. OpenAI's realtime
    // prompting guide says to start voice agents at "low".
    reasoning: { effort: "low" },
    instructions: buildInstructions(surface, context),
    audio: voice
      ? {
          input: {
            // A wrist is at arm's length from the mouth.
            noise_reduction: { type: "far_field" },
            // Semantic VAD waits for a finished thought rather than a pause,
            // which is what stops it talking over someone who says "um".
            turn_detection: { type: "semantic_vad", eagerness: "auto" },
            // No language pinned: people speak what they speak, and the app
            // side has no such limit either.
            transcription: { model: TRANSCRIPTION_MODEL },
          },
          output: { voice: VOICE },
        }
      : undefined,
    tools: toolsFor(surface),
    tool_choice: "auto",
  };
}

export async function mintSession(
  surface: Surface,
  context: SessionContext,
): Promise<MintedSession> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const response = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: buildSession(surface, context),
      expires_after: { anchor: "created_at", seconds: CLIENT_SECRET_TTL_SECONDS },
    }),
  });

  // Read as text first: an error page from upstream isn't always JSON, and its
  // status is what the server log needs.
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${text}`);
  const body: unknown = JSON.parse(text);
  const clientSecret = typeof body === "object" && body !== null && "value" in body ? body.value : undefined;
  if (typeof clientSecret !== "string") throw new Error("OpenAI did not return a client secret.");
  return { clientSecret, model: MODEL };
}
