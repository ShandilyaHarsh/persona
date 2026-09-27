# Persona onboarding — start anywhere, resume anywhere

A web simulator of Persona's onboarding across the **Persona Band** (left, a
wrist you can press) and an **iPhone** running the **Persona app** (right).
You text Persona in the app; you talk to it on the band. It's one
conversation, and you can start in either.

## Run

```bash
cp .env.example .env.local   # add OPENAI_API_KEY
npm install
npm run dev
```

Open it in Chrome and allow the microphone (band calls need it). Everything is
stored in this browser's localStorage; **Reset onboarding** sits between the two
devices.

## The path

1. **Name** — Persona offers names as tappable chips, or you type one.
2. **Your name.** A call on the band is offered here; the band lights up and you
   press it to answer.
3. **Gmail** — a card opens a secure sign-in page (simulated, prefilled with a demo
   account). The moment it connects, Persona uses it: *"3 threads from Stripe are
   waiting on you"* from a clearly-badged **demo inbox**.
4. **Another assistant?** — used Instinct, Muse, ChatGPT? Paste what it knows and
   Persona starts from there.
5. **"Walk me through yesterday"** instead of "what do you need?" — Persona pulls
   two or three tasks out of the story and puts them on the phone as cards. What
   you tap is the goal.
6. **A first real task** — Persona sets a small reminder from what you picked, and
   the band actually **buzzes** when it's due (time compressed to ~20s, labelled).

Every step is skippable, and the order is a default: volunteer something early
and Persona takes it.

## The band

- **Press once:** dismiss a buzz · answer a ringing call · end the call · or start one.
- **Press twice:** decline a ringing call.
- Calls only happen on the band; the app is for messaging. Say "let's just text"
  on a call and Persona ends it and picks up in the app.
- The ring pulses while a call is ringing or on.

## How it works

The full picture, with diagrams of the system, the layers, a call from press
to hand-over and the band's call lifecycle, is in
[docs/architecture.md](docs/architecture.md). In short:

- **One record, many sessions.** `src/domain/onboarding.ts` is the persisted record.
  Every realtime session — the app's messaging or a band call — is minted fresh
  from it (`src/services/openai/prompt.ts`), so a conversation can move between the two
  and the next session always knows what happened.
- **The conductor** (`src/services/conductor/`) holds at most one session and owns
  every hand-over, call outcome, card, reminder and buzz.
- **Cards** follow Lulu's pattern: the model calls `show_card`, the card appears
  after the sentence introducing it finishes, and the tap comes back to the model
  as an `[event]`. Cards never block the conversation — answering in words works
  too.
- **Model:** `gpt-realtime-2.1` over WebRTC; the server mints single-use client
  secrets (`src/app/api/realtime/route.ts`).

## Things to try breaking

| Try | What should happen |
| --- | --- |
| Decline or ignore the band's call | Carries on in the app, doesn't call again unless asked |
| Hang up / reload mid-call | Logged as ended / dropped; Persona follows up in the app |
| Deny the microphone | Falls back to the app and says how to enable voice |
| Give a joke name ("asdf") | One light jab, then respects it if you insist |
| Say "no" to Gmail in words | Recorded as declined; moves on without re-asking |
| Answer "idk" to yesterday | One easy follow-up, then offers options |
| Skip ahead ("just help me with X") | Lets you, still sets a first task |
| Press the band while it's connecting | Cancels the call; nothing is recorded |
| Continue on band, then change your mind | Cancel on the app's pill, or press the band twice |
| Open the Gmail sign-in and back out | Persona says it's fine to skip, and the card stays usable |
| Type a password into the chat | Removed from the thread; Persona tells you not to share it |
| Stay silent on a call | One "still there?", then the call ends |
| Two tabs, or reload anywhere | Tabs share one record; reminders, scans and dropped calls pick up where they were |

The full audit (128 cases, with what was fixed and what's still open) is in
[docs/edge-cases.md](docs/edge-cases.md).

## Simulated on purpose

Gmail sign-in, the inbox and reminder timing are simulated and say so on screen —
no real Google account or mail is touched. The wrist photo
(`public/wrist.webp`) was generated for this prototype.
