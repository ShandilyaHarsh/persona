# Architecture

A browser-only prototype of Persona's onboarding. Two surfaces, the **band**
(voice calls) and the **Persona app** on a simulated phone (messaging), share
one conversation. OpenAI Realtime does the talking; everything the conversation
learns lives in one record in `localStorage`. The only server code mints
short-lived OpenAI credentials.

## System overview

```mermaid
flowchart LR
  subgraph Browser["Browser (client)"]
    direction TB
    UI["UI components<br/>band/ · phone/ (Persona app) · shell/"]
    Decisions["decisions page<br/>static, no conductor"]
    Conductor["services/conductor<br/>client orchestration"]
    Session["services/openai/realtime-session<br/>RTCPeerConnection + mic"]
    subgraph Stores["lib/store"]
      Record[("onboarding store<br/>persisted record")]
      Live[("live store<br/>ephemeral UI state")]
    end
    LS[("localStorage<br/>persona.onboarding.v2")]
  end

  subgraph Server["Next.js server"]
    Route["POST /api/realtime<br/>app/api/realtime/route.ts"]
    Mint["services/openai/mint-session<br/>+ prompt.ts + tools.ts"]
  end

  subgraph OpenAI["OpenAI"]
    Secrets["/v1/realtime/client_secrets"]
    RT["/v1/realtime/calls<br/>Realtime model"]
  end

  UI -- "press, type, tap" --> Conductor
  Record -. "useStore re-render" .-> UI
  Live -. "useStore re-render" .-> UI
  Conductor -- "writes" --> Record
  Conductor -- "writes" --> Live
  Record -- "persist on every set" --> LS
  LS -- "hydrate on load, storage event from other tabs" --> Record
  Conductor -- "open, sendEvent, sendUserText" --> Session
  Session -- "transcripts, tool calls, ended" --> Conductor
  Session -- "surface + record context" --> Route
  Route --> Mint
  Mint -- "OPENAI_API_KEY, session config" --> Secrets
  Secrets -- "single-use client secret" --> Mint
  Session -- "SDP offer with client secret" --> RT
  Session <== "WebRTC audio + data channel oai-events" ==> RT
```

- **The API key never leaves the server.** The route turns `{ surface, context }`
  into a 60-second client secret whose session config (instructions, tools,
  voice, VAD) is fixed server-side. The browser then negotiates WebRTC with
  OpenAI directly; audio never touches our server.
- **Three kinds of state**, all in `services/conductor/state.ts`:
  - `onboarding`: the persisted record (`domain/onboarding.ts`: profile, Gmail
    status, calls, thread of messages/cards/events/reminders). The source of truth.
  - `live`: ephemeral UI state (which phone screen, session status, ringing,
    buzz, banner, caption). Gone on reload, by design.
  - `runtime`: the conductor's private, non-reactive working state (current
    session, generation counter, queued events, timers). Not rendered.

## Layers

```mermaid
flowchart TD
  App["app/<br/>routes, layouts, API route"]
  Components["components/<br/>band · phone · shell · decisions"]
  Conductor["services/conductor/<br/>only writer of app state"]
  OpenAIClient["services/openai/<br/>realtime-session (client)"]
  OpenAIServer["services/openai/<br/>mint-session, prompt, tools (server)"]
  Domain["domain/<br/>pure types + demo data"]
  Lib["lib/store<br/>generic, no product knowledge"]

  App --> Components
  App -- "API route only" --> OpenAIServer
  Components --> Conductor
  Conductor --> OpenAIClient
  Conductor --> Domain
  OpenAIClient --> Domain
  OpenAIServer --> Domain
  Components -. "useStore" .-> Lib
  Conductor -. "createStore" .-> Lib
```

Rules (from `AGENTS.md`): dependencies point down only; `domain/` imports
nothing; components read stores and call conductor functions, never OpenAI or
`localStorage`; server code (`mint-session.ts`, the route) never imports client
code. Components may import `domain/` types and constants directly.

## The key flow: press the band, talk, hand back to the app

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as UI (band, Persona app)
  participant C as conductor
  participant S as realtime-session
  participant API as /api/realtime
  participant OAI as OpenAI Realtime

  User->>UI: press band (ringing or idle)
  UI->>C: bandPress()
  C->>C: generation++, close any app session, live.session = connecting
  C->>S: RealtimeSession.open("band", context from record)
  S->>S: getUserMedia (mic first, fail fast)
  par mint while building the offer
    S->>API: POST { surface, context }
    API->>OAI: client_secrets with instructions + band tool belt
    OAI-->>API: client secret (60 s)
    API-->>S: { clientSecret, model }
  and
    S->>S: createOffer, data channel "oai-events"
  end
  S->>OAI: POST /v1/realtime/calls (SDP offer)
  OAI-->>S: SDP answer, channel opens
  S-->>C: session
  C->>C: stale generation? close and stop. Else session = live
  C->>S: sendEvent("[event] They answered your call...")
  C->>S: flush events queued while connecting
  loop the call
    OAI-->>S: transcripts, response.done with function calls
    S-->>C: onUserText / onAssistantText
    C->>C: append to thread, place pending card
    S-->>C: onToolCall(show_card / save_details / ...)
    C->>C: owner still current? write record, else refuse
    C-->>S: tool result
    S->>OAI: function_call_output (+ response.create unless silent)
  end
  Note over UI,C: every record or live write re-renders the UI via useStore
  User->>UI: press band again (or Persona calls end_call)
  UI->>C: bandPress()
  C->>S: close()
  C->>C: recordCall(hung_up), did the call move anything?
  C->>S: RealtimeSession.open("app", fresh context from the same record)
  S->>API: POST { surface: app, context }
  Note over C,OAI: same mint + SDP exchange, text-only, app tool belt
  C->>S: sendEvent("[event] The user ended the call... pick up with the next step")
  OAI-->>S: one short message
  S-->>C: onAssistantText, appended to the thread
```

Notes on the diagram:

- **Instructions are built at mint time on the server**, not by a client
  `session.update`. `prompt.ts#buildInstructions` renders identity, voice,
  channel, goals, what is known, past calls and the tail of the thread
  (`historyLines`) into the session config.
- **Why a session is opening** always arrives as one `[event] …` system message
  right after it connects. The app session after a call is only opened if the
  call progressed something (a saved detail, a card answered, real speech).

## Band call lifecycle

```mermaid
stateDiagram-v2
  [*] --> Idle

  state "Ringing by Persona" as RingingPersona
  state "Ringing by user" as RingingUser
  state "Connecting" as Connecting
  state "Live call" as LiveCall
  state "Ended" as Ended

  Idle --> RingingPersona : start_call tool, after a yes
  Idle --> RingingUser : Continue on band in the app
  Idle --> Connecting : press

  RingingPersona --> Connecting : press, answer
  RingingPersona --> Idle : double press, declined and recorded
  RingingPersona --> Idle : 25 s timeout, missed and recorded

  RingingUser --> Connecting : press
  RingingUser --> Idle : double press or cancel pill, nothing recorded
  RingingUser --> Idle : 25 s timeout, nothing recorded

  Connecting --> Idle : press, cancel with nothing recorded
  Connecting --> Idle : mic denied or connect failed, app explains
  Connecting --> LiveCall : channel open and generation still current

  LiveCall --> Ended : press, hung up
  LiveCall --> Ended : end_call tool
  LiveCall --> Ended : ICE failed or channel closed, dropped
  LiveCall --> Ended : page reload, dropped on next load
  LiveCall --> LiveCall : mic lost, Persona says so then end_call
  LiveCall --> LiveCall : 45 s silence, one check-in

  Ended --> Idle : call recorded, app follows up if it moved anything
```

- A press also dismisses a buzzing reminder first; if a call is ringing at the
  same time, the same press answers it.
- A press within 600 ms of a call ending is ignored (the tail of a multi-press).
- Persona stops placing calls after two missed or declined ones (`ringBand`).
- Only Persona's ring is persisted (`personaRingingSince`), so a reload mid-ring
  still counts as missed. An open call is persisted as `callStartedAt`, so a
  reload mid-call is recorded as dropped.

## Core ideas

- **One record, many sessions.** No session carries memory forward. Each one is
  minted fresh from the persisted record, and told in one `[event]` line why it
  is opening. That is all "start anywhere, resume anywhere" is.
- **At most one realtime session.** `sessions.ts#connect` closes whatever was
  open before connecting. The band and the app never hold the conversation at
  the same time; text typed during a call joins the call.
- **Stale work can't write.** Every open, cancel and reset bumps
  `runtime.generation`. A connect that lands late closes itself; a tool call
  checks `owner === runtime.session` before and after any await; timers check
  that their thread item still exists.
- **Connecting means queue.** `deliver()` sends to the live session, queues in
  `runtime.pendingEvents` while one is opening, or opens an app session if
  nothing is open and the event wants a reply. Typed messages wait on the open
  in flight.
- **Cards are non-blocking and follow their line.** `show_card` returns at once;
  the card is placed after the sentence that introduces it (waits for speech to
  end on a call, or for the next assistant line in the app, max 6 s). The tap
  comes back later as an `[event]` via `completeCard`. Answering in words
  settles open cards the same way (`save_details`).
- **Silent tools.** `show_card`, `start_call`, `set_reminder` and `graduate`
  don't earn a second reply when the response already spoke; `save_details`
  rides along silently with them. A failed tool always gets a reply.
- **Held inbox finds.** When the demo inbox scan finishes, the finds are held
  until the "used an agent before?" answer makes them useful (straight away for
  yes; with the next answer for no), capped at 3 user turns or 60 s. On a call
  they are spoken; if the call ends before one is picked they come back as a card.
- **Timers survive reload.** Reminders and the inbox scan store absolute times
  (`firesAt`, `readyAt`) in the record; `lifecycle.ts#hydrate` re-arms them,
  re-holds undelivered finds, and records dropped calls and missed rings.
- **Tabs share one record.** A `storage` event from another tab is adopted
  (`store.adopt`) rather than overwritten.
- **Deterministic before prompted.** Anything the brief requires (card
  ordering, one reminder per onboarding, no re-asking declined Gmail, call
  limits) is enforced in tool handlers and steered through tool results, not
  left to the prompt.

## Directory map

```
src/
  app/
    page.tsx                 Loads shell/app client-only (ssr: false)
    api/realtime/route.ts    POST: validate, mintSession, plain error on failure
    decisions/               Static design-decisions page (content.ts + page)
  components/
    band/                    Wrist photo, press/double-press, presence ring
    phone/                   Home screen, Persona app thread, cards, consent sheet, call pill
    shell/                   Two-device layout, reset button, top bar
    decisions/               Views for the decisions page
  domain/
    onboarding.ts            Record types, schema version, parseSaved, historyLines
    demo.ts                  Everything simulated: Google account, inbox, time compression
  lib/store.ts               createStore (optional localStorage), useStore
  services/
    openai/
      mint-session.ts        Server: session config + client secret
      prompt.ts              buildInstructions(surface, context): Persona's voice and goals
      tools.ts               Tool schemas and the per-surface belts
      realtime-session.ts    Client: WebRTC, mic, oai-events protocol, speech timing
    conductor/
      index.ts               Public API the components use
      state.ts               The onboarding, live and runtime state
      thread.ts              Appending to the thread, call records, card placement
      sessions.ts            Open/close sessions, deliver events, transcripts, silence check
      calls.ts               Band presses, ringing, ending calls, after-call follow-up
      tool-handlers.ts       runTool: save_details, show_card, end_call, redact, graduate
      cards.ts               Card taps and settling, consent sheet, card [event] text
      inbox.ts               Demo inbox scan and when its finds are delivered
      reminders.ts           set_reminder, arming timers, the buzz
      lifecycle.ts           hydrate (restore and re-arm), cross-tab adopt, reset
      phone.ts               Phone screens, banners, sendText, voice levels
```

## Where to make common changes

**Add a tool**
1. Schema in `services/openai/tools.ts`; add it to the belt of each surface
   that should have it (`BELTS`).
2. Handle it in `services/conductor/tool-handlers.ts#runTool`. Validate
   arguments as `unknown`, and return a result that steers the model
   (`{ status, note }` or `{ error }`).
3. If its introducing line is the whole point, add it to `SILENT_TOOLS` in
   `sessions.ts`.
4. Mention it in `prompt.ts` only if the model needs to know when to use it.

**Change Persona's voice**
- Words and tone: `VOICE` and `CHANNEL` in `services/openai/prompt.ts` (change
  the prompt, not the output).
- The spoken voice, model, transcription model: env vars read in
  `mint-session.ts` (`OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_MODEL`,
  `OPENAI_TRANSCRIPTION_MODEL`).
- Post-processing of transcripts (em dashes, duplicate lines):
  `sessions.ts#onTranscript`.

**Add a card kind**
1. `domain/onboarding.ts`: extend `CardKind` (and `CardResult` if it has a new
   outcome; update `describeResult` for history).
2. `tools.ts`: add it to the `show_card` enum and description.
3. `tool-handlers.ts`: a banner in `CARD_BANNERS`, and any guard in `showCard`.
4. `cards.ts`: what a tap writes in `completeCard`, the user-side text in
   `answerText`, the `[event]` in `cardEvent`.
5. `components/phone/cards.tsx`: render it in `CardBody`.
