import { parseSessionRequest } from "@/domain/onboarding";
import { mintSession } from "@/services/openai/mint-session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[realtime] session request isn't JSON:", error);
    return Response.json({ error: "Invalid session request." }, { status: 400 });
  }
  const session = parseSessionRequest(body);
  if (!session) return Response.json({ error: "Invalid session request." }, { status: 400 });

  try {
    return Response.json(await mintSession(session.surface, session.context));
  } catch (error) {
    // The raw reason stays in the server log; the phone only needs to know it failed.
    console.error("[realtime] mint failed:", error);
    return Response.json({ error: "Couldn't start a session." }, { status: 502 });
  }
}
