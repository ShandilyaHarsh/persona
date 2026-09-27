/**
 * The conductor decides who holds the conversation.
 *
 * There are two places to hold it: messaging in the Persona app, and a call on
 * the band. At most one realtime session is open at a time, and every hand-over
 * goes through here: what the last session learned is already in the persisted
 * record, and the next one is minted from it and told, in one [event] line, why
 * it is opening. That is the whole of "start anywhere, resume anywhere".
 *
 * Two rules keep it honest when people do things out of order:
 *
 *  1. Work that outlives its session doesn't write. Every tool call and timer
 *     remembers which session or generation it belongs to, and stops if the
 *     conversation has moved on (hung up, reset, superseded).
 *  2. "Connecting" means "queue", not "busy" or "empty". Anything that happens
 *     while a session is opening waits and is delivered when it lands.
 */

export { bandDoublePress, bandPress, cancelRing, continueOnBand } from "./calls";
export { cancelConsent, completeCard, openConsent } from "./cards";
export { hydrate, reset } from "./lifecycle";
export { goHome, openPersonaApp, sendText, voiceLevels } from "./phone";
export { live, onboarding } from "./state";
