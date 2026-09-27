# Persona onboarding - edge cases

An audit of what the prototype **actually does** in awkward situations, traced through the code (not the README). Every claim below cites the file and function it was read from. Where behaviour depends on the model or a browser and could not be settled by reading, the case is marked **unverified** with what to test.

Files read in full: `src/services/conductor/`, `src/domain/onboarding.ts`, `src/services/openai/realtime-session.ts`, `src/lib/store.ts`, `src/domain/demo.ts`, `src/services/openai/prompt.ts`, `src/services/openai/tools.ts`, `src/services/openai/mint-session.ts`, `src/app/api/realtime/route.ts`, all of `src/components/**`, `README.md`, `src/app/decisions/page.tsx`.

Verdict key: **Bug** = code does something wrong · **Gap** = nothing handles it · **Fine** = correct today · **Unverified** = needs a run to confirm. Severity is only given for bugs/gaps.

---

## Status after the fix pass (27 Sep 2026)

The audit below describes the code **before** this pass and is kept as the record of what was wrong. Every bug and gap was fixed or deliberately accepted, and each is listed here with how.

**Two structural rules in `services/conductor` close most of them:**
- **Stale work can't write.** Tool handlers take the session they belong to and re-check it after every await. Timers check the record still holds their item. Reset bumps the generation and clears every timer, queue and baseline. This fixes A14, A15, C13, H4 and H5.
- **Connecting means queue, not drop.** One `deliver()` sends to the live session, queues behind one that is connecting (flushed on connect, in order), or opens the app. This fixes B4, C3, D6, E3 and H9. A failed connect clears `opening` before it follows up, so nothing queues behind a dead attempt (found while verifying).

| Case | Now |
| --- | --- |
| A2, A3 | Partial transcripts are kept. A line cut off by a hang-up or barge-in is recorded with a trailing … instead of the full scripted sentence. |
| A5, J1 | A press while connecting cancels the call. The band hint and label say "Press to cancel". |
| A6 | Presses within 600 ms of a call ending are ignored. |
| A9 | A "Reconnecting…" notice appears on a network blip; the call only counts as dropped after 5 s. |
| A10 | Mic lost: a band notice, and Persona says so and ends the call. |
| A11 | Reload mid-call records "Call dropped", and the app follows up. |
| A12 | Reload mid-ring records a missed call (`personaRingingSince`). |
| A13 | Another tab's writes are adopted via the `storage` event, not overwritten. |
| A17 | The ring cap counts only missed or declined calls. |
| A18 | A call only counts as having moved things on if the person said at least two words, typed, or changed the record. |
| A19 | After 45 s of silence Persona checks in once, then ends. |
| A20 | A session ending on its own gets an app follow-up. |
| A22 | Accepted. The app session's in-flight partial is kept as cut off. |
| A16 | A call under 3 s with nothing said is treated as a mis-press: one line offering to call back. |
| B1 | Typing during a call joins the call and counts as progress. The composer reads "Type to add to the call". |
| B7 | The pill has a Cancel button, and pressing the band twice also cancels. |
| B12 | One press dismisses the buzz and answers the ring. |
| B14 | Accepted. A ring still needs a press, so an unasked call is one tap to ignore. |
| C1, C9, D12 | A name, Gmail decision or goal given in words settles the open card. |
| C2, E6 | Picking an option closes the other option cards. During onboarding, only one reminder can be set. |
| C6 | Backing out of the vault sends an event, and Persona acknowledges it. |
| C7 | The email is locked to the demo account, and the footer says it's a demo inbox. |
| C12 | `show_card` refuses repeats: a name that's already set, Gmail already connected or declined (unless `user_asked`), a second option card. |
| D3, D4, D5, D6 | Held finds ask for their own reply on the band. `delivered` survives reload. Finds spoken on a call come back as a card if none was picked. |
| D7 | Finds go out after 3 answers or 60 s, whichever comes first. |
| D9, G4 | "yes"/"no" strings are coerced. Fields it couldn't save come back as `not_saved`. |
| E7 | Follow-up no longer stops at graduation. |
| E10 | Accepted. Graduation is invisible, so its order doesn't matter to the person. |
| F1, F2 | Names are trimmed and capped at 24 characters in the tool and quoted in the prompt. |
| F5 | `redact_last_message` replaces the message in the thread. The model has still seen it. |
| F6 | Renaming works through `save_details`; Gmail can be shown again with `user_asked`. |
| F12 | The transcription language is no longer pinned to English. |
| F13 | A leading "[event]" is stripped from typed text. |
| G1, G5 | Duplicate check is normalised against the last two lines; the unanswered-question check reads every bubble. |
| G2 | Better, not solved. "Not this" examples were added; `save_details` and the task-picked event steer the next move. Preambles still slip through sometimes. |
| H1, H2, H6, H7 | Saved data is validated (`parseSaved`, schema v3) and reads and writes are in try/catch. `hydrate()` is idempotent. |
| H3 | A non-secure origin now says voice needs https or localhost. |
| I2 | The thread is `role="log"` with `aria-live`, the band line is live, and the pill is `role="status"`. |
| I3 | A missing microphone gets its own copy. |
| I9 | The pill now explains the ring, so the icon-only button's tooltip matters less. |

**Still open:**
- **I6 (small screens)** was not changed.
- **I4 and I5 (Safari, Firefox)** and every voice path need a real browser with a microphone. The browser pane used for verification blocks the mic.
- **The D8, F3, F4, F9, F11 and G10 model-behaviour cases** remain prompt-dependent and unverified.

**Verified in the browser this pass:**
- Typed name settling the card (C1).
- Gmail card after the names.
- Vault Cancel event (C6).
- Locked email (C7).
- Late connect, scan, then the "yes" path and finds.
- Password redaction (F5).
- Pick, then one reminder, then buzz.
- Mic-denied follow-up.
- Cancel on the pill (B7).

---

## Answering the question first: "can the person move a call from phone to band? I don't see that UI"

**What exists.** In the Persona app there is one affordance, the round button with the band glyph to the right of the composer (`src/components/phone/persona-app.tsx` → `AppComposer`, `aria-label="Continue on your band"`). Tapping it calls `continueOnBand()` (`src/services/conductor/`), which does **not** start a call: it makes the band *ring* on the user's own behalf (`ringBand("user")` → `live.ringing = "user"`, band lit and vibrating, 25 s timeout). The pill at the top of the app then reads "Press your band to start the call" (`call-pill.tsx`). The call only begins when the person **presses the band** (`bandPress` → `openSession("band", "The user moved the conversation from the app to a call…")`). Pressing the band directly, without touching the app, does exactly the same thing (`bandPress` → `session?.surface === "app"` → same "moved the conversation" reason), so the button is a *signpost*, not a distinct capability.

There is a second way a call starts from the app: Persona asks ("can I call your band for a minute?") and, on a yes, calls the `start_call` tool → `ringBand("persona")` → the band rings and the person presses it.

**What does not exist.** There is no phone call. `Surface` is `"app" | "band"` only (`onboarding.ts`); the app session is minted with `output_modalities: ["text"]` and no microphone (`services/openai/mint-session.ts` → `buildSession`; `realtime-session.ts` → `open`, `voice = surface === "band"`). There is no "take this call on the phone" control, no tool for it, and `end_call` on the band only ends (with an optional follow-up in the app as *text*). The decisions page states this as a choice: "Calls only ever happen on the Band; the app stays for messaging" (`src/app/decisions/page.tsx`, "The call happens on the Band"). The repo has a single commit, so I could not confirm from history that a phone-call path was *removed*; I can confirm nothing of the kind exists now.

**Is Continue-on-band discoverable enough? Honestly: no, not on its own.**
- It is an icon-only button with no visible label; the `title` tooltip is desktop-only. The glyph (a rounded rectangle with a dot) does not read as "call" or "voice" - the app's own empty-state copy says "press your band to talk", so the button teaches a second, indirect way to do the same thing.
- It is a two-step action (tap, then walk to the band and press) with no way to cancel from the app; the button just goes to 35 % opacity while ringing (`disabled={onBand}`). Cancelling requires knowing to double-press the band (see B7).
- Nothing in the app says "calls happen on your band, not here", so someone looking for a phone-call button will keep looking.
- Recommendation: either label it ("Talk on band"), or drop it and make the pill/empty-state copy carry the instruction ("Press your band any time to switch to voice"), and add a "Cancel" to the ringing pill.

---

## Summary

### Counts by severity (bugs and gaps only)

| Severity | Count |
| --- | --- |
| High | 5 |
| Medium | 26 |
| Low | 32 |
| **Bugs + gaps** | **63** |
| Fine (verified correct) | 49 |
| Unverified (needs a run) | 9 |
| Cross-references only (G11, I1, J2-J6) | 7 |
| **Total cases** | **128** |

High: A15, B4, C3, E7, H1. Roughly two thirds of the Medium items collapse into the two structural fixes at the end of this document.

### Top 10 to fix first

| # | Case | Why first |
| --- | --- | --- |
| 1 | **B4** Typing while the app session is connecting, then pressing the band, kills the new band call | `sendText` awaits a superseded connect, gets `null`, and opens a *second* app session over the live band call. Natural gesture; call dies silently and is never recorded. |
| 2 | **A14 / A15 / H4** Tool handlers keep running after their session is gone | `end_call` and `show_card` await `waitForSpeechEnd` for up to 15 s; if the user hangs up or resets meanwhile the handler still writes: a second call record, a card or a call event in a freshly reset thread, a phantom app follow-up. One guard fixes all three. |
| 3 | **C3 / D6** Events are dropped while a session is `opening` | `followUp` returns early when `opening` is set, so a card tap or the inbox finds during the ~1-2 s connect are never told to the model, and the new session's context was built before they happened. |
| 4 | **H1** Corrupt or non-JSON `localStorage` blanks the whole page | `readPersisted` has no try/catch and `hydrate()` runs at module scope in `app.tsx`, so the dynamic import rejects and nothing renders. |
| 5 | **E7** After `graduate` with all four fields, `followUp` is a no-op | Card taps, dropped calls and late inbox finds go unanswered. Tapping "Check in for Wednesday's flight" does nothing. |
| 6 | **A5** Pressing the band while "Connecting…" restarts the connection instead of cancelling | `onCall()` is false while connecting; the press falls through to "start a call"; two mic prompts, two mints; UI says "Press to end the call". |
| 7 | **D4** Finds delivered on the band are re-delivered as a card after a reload | Band delivery leaves no thread record, so `hydrate` recomputes `inboxFindsHeld = true`. |
| 8 | **C6** Cancelling the Gmail consent sheet tells the model nothing | The conversation stalls with Persona waiting for an `[event]` that never comes. |
| 9 | **A9** ICE `disconnected` is ignored; only `failed` ends the call | Up to tens of seconds of dead air shown as a live call. Plus mic revoked mid-call is never detected. |
| 10 | **I1** Transcription is hard-coded to `language: "en"` | Non-English speakers on the band are mis-transcribed; the app has no such limit, so the two surfaces disagree. |

---

## A. Call lifecycle

**A1 · One press during a live call ends it.**
Today: `bandPress` → `onCall()` → `endCall("hung_up")` → `recordCall` → `afterCall(moved, …)` (`services/conductor`). `endCall` nulls `session` before `close()`, so `onSessionEnded` ignores the echo (`if (session !== ended) return`). Verdict: **Fine.**

**A2 · Ending while Persona is mid-sentence.**
Today: `endCall` → `RealtimeSession.finish` pauses the `<audio>` and closes the channel. The `response.output_audio_transcript.done` event for the sentence in flight never arrives, so the half-said line is **not in the thread**; the user's own unfinished utterance is not transcribed either. The follow-up prompt then says "Everything said on the call is in the conversation above" (`afterCall`), which is untrue for the last exchange. Verdict: **Gap · Medium.** Fix: on `finish`, capture the partial transcript from `response.output_audio_transcript.delta` events (accumulate deltas per item) and append it marked as cut off; tell the follow-up session the last line may have been interrupted.

**A3 · Barge-in: user talks over Persona.**
Today: semantic VAD cuts the audio (`output_audio_buffer.cleared` → `speaking=false`), but `response.output_audio_transcript.done` still delivers the **full** scripted sentence, so the thread records words the user never heard. Verdict: **Gap · Low.** Fix: on `cleared`, truncate to deltas received so far (same mechanism as A2).

**A4 · Rapid double press during a live call.**
Today: `band.tsx` `press()` debounces 280 ms; a second press inside that calls `bandDoublePress` → no ringing → `bandPress` → ends the call. Same as a single press. Verdict: **Fine** (though every single press is delayed 280 ms; acceptable).

**A5 · Press while the band shows "Connecting…".**
Today: `session` is only assigned after `RealtimeSession.open` resolves (`connect`), so `onCall()` is **false** during connecting. `bandPress` therefore falls to the "start a call" branch → `openSession("band")` → `++generation`, second `getUserMedia`, second mint; the first connect finishes, sees `mine !== generation`, and closes itself. The press restarts instead of cancelling. Meanwhile `band.tsx` `aria-label` and `band-panel.tsx` hint both say "Press to end the call" because `status` is truthy. Verdict: **Bug · Medium.** Fix: track `opening?.surface === "band"` in `bandPress` and treat a press during connecting as cancel (`generation++`, `patchLive({session:null})`, record nothing).

**A6 · Triple press during a live call.**
Today: press 1 arms the timer; press 2 (≤280 ms) → `bandDoublePress` → `bandPress` → call ends and `afterCall` may start an app follow-up (`opening.surface === "app"`); press 3 arms a new timer → `bandPress` → `session` null, `opening?.surface === "app"` → `openSession("band", "moved the conversation…")`: the call the user just ended **restarts**, killing the app follow-up. Verdict: **Bug · Medium.** Fix: ignore presses for ~600 ms after a call ends; or require the ring to be idle (not `opening`) before starting a new call from a press.

**A7 · Press at the exact moment the ring times out.**
Today: both `ringTimer` and the click handler run on the main thread; whichever runs first wins cleanly (`stopRinging` clears the other path). Verdict: **Fine.**

**A8 · Microphone denied when answering / starting a call.**
Today: `claimMicrophone` throws `MicrophoneError` before the mint (`RealtimeSession.open`); `connect` catches → `onCallFailed` → event "The band needs microphone access", `bandNotice` "Allow the microphone to talk", and `followUp(...)` moves the conversation to the app. No call record is written. Verdict: **Fine.** Two small notes: (a) `openPersonaApp` clears `bandNotice`, so the hint disappears as soon as the app is opened (Low); (b) `NotFoundError` (no mic at all) and `NotAllowedError` get the same "allow the microphone" copy (see I3).

**A9 · Network drop mid-call.**
Today: only `connectionState === "failed"` or the data channel closing ends the call (`RealtimeSession.wire`). ICE goes `disconnected` first and can sit there 10-30 s before `failed`; during that time the UI shows a live call with a lit ring and "Listening…". When it does fail → `finish("dropped")` → `onSessionEnded` → `endCall("dropped")` + follow-up "you got cut off". Verdict: **Gap · Medium.** Fix: on `disconnected`, show "Reconnecting…" under the band and start a ~5 s timer that ends the call as dropped if it does not recover.

**A10 · Microphone revoked mid-call (OS/browser toggle).**
Today: nothing listens to `track.onended` or `track.muted`; the call continues sending silence; the model may say "I can't hear you". No UI change. Verdict: **Gap · Medium.** Fix: listen for `onended`/`onmute` on the mic track, set `bandNotice`, and send an `[event]` so Persona can say so and offer the app.

**A11 · Reload or close the tab mid-call.**
Today: `hydrate` sees `saved.callStartedAt` and writes `recordCall("dropped", …)` (`services/conductor` → `hydrate`). No follow-up message is sent; the next session merely sees "[event] Call dropped" in history. README says "Persona follows up in the app" - it does not, for the reload case. Verdict: **Gap · Low.** Fix: after recording the drop in `hydrate`, call `followUp(backInApp("The call dropped when the page reloaded…"))`.

**A12 · Reload while the band is ringing.**
Today: `ringing` lives in the non-persisted `live` store, so it is simply gone. A Persona-initiated ring is never recorded as missed; the model never learns. Verdict: **Gap · Low.** Fix: persist `ringing` (or record "missed" in `hydrate` if a ring was active).

**A13 · Two tabs open.**
Today: each tab hydrates from the same key, holds its own session, and `store.set` rewrites the **whole** state on every change, so the tabs clobber each other's threads; a call in tab A and typing in tab B produce two sessions. No `storage` event listener. Verdict: **Bug · Medium** (High for data, but a prototype). Fix: `BroadcastChannel`/`storage` listener to adopt the other tab's writes, or a simple "already open in another tab" lock.

**A14 · Hang up on the band while the model's `end_call` is waiting for its goodbye to finish.**
Today: `runTool("end_call")` does `await session?.waitForSpeechEnd()` (up to 15 s). If the user presses the band during that wait, `bandPress` → `endCall("hung_up")` records the call and closes the session; `waitForSpeechEnd` exits on `ended`, and the handler continues: `surface === "band"` → `endCall("completed")` **again** → a second `recordCall` ("Call on the band · 0:00", since `callStartedAt` is already null) and a second event line. `onResponseDone`'s `if (this.ended) return` only guards the *reply*, not the side effects. Verdict: **Bug · Medium.** Fix: capture the session at tool-call time and bail in every handler if `session !== that` (or if `!onCall()` for `end_call`).

**A15 · Reset onboarding while `end_call` / `show_card` is waiting for speech to end.**
Today: `reset()` closes the session and sets `onboarding` to `INITIAL_STATE`, but does **not** clear `callBaseline`. The pending `end_call` handler then wakes: `endCall("completed")` → `recordCall` into the fresh state (event "Call on the band · 0:00"), `callBaseline !== progress()` → `moved` true → `afterCall` → `followUp` opens an app session that says "You just wrapped up the call…" into an empty onboarding. A pending `show_card` likewise appends a card into the fresh thread, which also defeats the `thread.length === 0` first-contact checks in `openPersonaApp` and `bandPress`. Verdict: **Bug · High.** Fix: same guard as A14, and reset `callBaseline` in `reset()`.

**A16 · Persona-initiated call answered, then hung up within a second.**
Today: `endCall("hung_up")`, `moved` false (no speech, nothing changed) → no follow-up. The app session was closed by the band connect, so the app is silent until the user types. Verdict: **Fine** by the stated rule ("a call that went nowhere doesn't earn a message"), but the person who accidentally answered and hung up gets no "want me to try again?" - Low gap. Fix: treat a call under ~3 s as a mis-press and send one short line.

**A17 · Persona's ring cap counts every call, not Persona's calls.**
Today: `ringBand("persona")` refuses when `onboarding.calls.length >= MAX_CALLS_PLACED (3)`; `calls` includes user-initiated, dropped and hung-up calls. After three calls of any kind, a user who says "call me" gets `not_placed` and the model has to explain it cannot. The prompt says "never call more than twice" while the code allows three. Verdict: **Bug · Low.** Fix: count only `missed`/`declined` outcomes for the cap, and never cap a call the user just asked for.

**A18 · Background noise transcribed as speech ("Thank you.").**
Today: any non-empty user transcript via band counts as `spoke` in `endCall`, so a call with only noise still triggers an app follow-up. Verdict: **Gap · Low.** Fix: require a minimum transcript length or a saved detail.

**A19 · Silence on the call.**
Today: no idle timeout; the call stays open until OpenAI closes it (then `channel.onclose` → "dropped" → "you got cut off" follow-up, which is misleading). Verdict: **Gap · Low.** Fix: after ~45 s of no speech either way, have Persona ask once and then `end_call` with a "done" reason.

**A20 · Call ends because the OpenAI session itself ends (server-side cap/idle).**
Today: treated as `dropped` → "Say you got cut off" follow-up. Verdict: **Gap · Low** (same fix as A19).

**A21 · Connect failure after the mic prompt (mint 502 / SDP error / no `OPENAI_API_KEY`).**
Today: `ConnectError` → `onCallFailed` → "The band couldn't connect", `bandNotice` "Couldn't connect. Try again", app follow-up. No retry button; pressing the band again retries. Verdict: **Fine.**

**A22 · Old app session mid-response when the band call starts.**
Today: `connect` closes the app session immediately (`session?.close()`), dropping the reply in flight; the typing dots vanish and the band session's history lacks that line. Verdict: **Gap · Low.** Fix: acceptable, but the band reason could say "your last reply may not have landed - finish that thought".

---

## B. Moving between app and band

**B1 · Typing in the app during a band call.**
Today: `sendText` appends via `"app"` and sends the text into the **band** session (`target = session`), whose `output_modalities` is `["audio"]`, so Persona **answers out loud on the wrist**, not in writing. The app shows no typing indicator (`typing` requires `surface === "app"`), and typed text is not counted as `spoke` in `endCall` (`via === "band"` filter). Verdict: **Gap · Medium.** The stated design is "during a call it joins the call", but someone typing usually cannot talk. Fix: show a hint in the composer during a call ("Persona will answer on your band - or end the call to text"), and count app messages during a call as progress.

**B2 · Pressing the band while the app is mid-response.**
Today: `bandPress` → `openSession("band", "moved mid-thought")` → the app reply in flight is lost (A22). Verdict: **Fine** apart from A22.

**B3 · Continue on band while a reply is streaming.**
Today: `continueOnBand` only rings; the app session keeps streaming and its reply lands in the app. If that reply happens to call `start_call`, `ringBand("persona")` returns `already_ringing`. Verdict: **Fine.**

**B4 · Type a message while the app session is connecting, then press the band before it connects.**
Today: `sendText` does `session ?? (opening ? await opening.promise : null) ?? (await openSession("app"))`. The band press bumps `generation`, so the awaited app connect resolves **`null`**, and `sendText` falls through to `openSession("app")` - which `++generation`s and closes (or supersedes) the band call the user just started. The band goes dark, the ring shows "Connecting…" then idle, the call is never recorded (`callStartedAt` may stay set → phantom "Call dropped" on the next reload), and Persona answers the typed text in the app instead. Verdict: **Bug · High.** Fix: after the `await`, re-read the module-level `session`/`opening` and use whichever is current; only open a fresh app session if neither exists.

**B5 · Band call started while the app session is connecting (no typing).**
Today: `bandPress` → `opening?.surface === "app"` → band opens; the app connect is superseded on arrival. Verdict: **Fine.**

**B6 · Continue on band, then never press the band (ring missed).**
Today: after 25 s (`RING_TIMEOUT_MS`) `stopRinging`; `who === "user"` → return silently. The pill just disappears. Verdict: **Fine** (a Low copy gap: nothing says "you can also just press your band later").

**B7 · Cancelling a user-initiated ring.**
Today: the button is disabled while ringing; the only cancel is a **double press on the band** (`bandDoublePress` → `stopRinging`; `ringing === "user"` → return). Nothing in the app or band copy says so ("Press to start the call · Continuing from the app"). Verdict: **Gap · Low.** Fix: a "Cancel" in the pill, and hint copy "press twice to cancel".

**B8 · Persona's ring missed.**
Today: `recordCall("missed", 0)`, event "Missed call", `session?.sendEvent("The band rang out…")` → Persona continues in the app (banner if the app is closed). If the app session has since dropped, the model learns from history. Verdict: **Fine.**

**B9 · Persona's ring declined (double press).**
Today: `recordCall("declined")` + event to the app session. Verdict: **Fine.**

**B10 · Repeated rings.**
Today: `already_ringing` guard, plus the cap in A17. Verdict: **Fine** (see A17).

**B11 · The user answers a Persona ring while the app is on the home screen.**
Today: band panel says "Ava is calling"; the app pill is not visible; the banner shows Persona's last text. Verdict: **Fine.**

**B12 · Reminder fires while the band is ringing.**
Today: `buzz` and `ringing` both set; `bandPress` handles `buzz` first, so the first press only dismisses the buzz and the second answers; `band-panel.tsx` shows "Reminder: …" over "X is calling". Verdict: **Gap · Low.** Fix: when ringing, a press should answer and clear the buzz together.

**B13 · Continue on band while a band session is connecting.**
Today: the UI button is disabled (`session?.surface === "band"` covers `connecting`), so `continueOnBand`'s weaker `onCall()` guard is never reached. Verdict: **Fine** (but `onCall()` ignoring `connecting` is the root of A5/B4).

**B14 · Persona calls without asking (model ignores the "only after a yes" rule).**
Today: nothing in code enforces it; the band rings; the user can decline. Verdict: **Gap · Low.** Fix: none needed in code; keep the prompt rule and watch transcripts.

**B15 · Go to the home screen during a call.**
Today: the band session continues; captions under the band; cards → banner; `appOpen()` false, so the band prompt already told the model to say "it's waiting in the app". Verdict: **Fine.**

---

## C. Cards and consent

**C1 · Tapping a stale name card after typing a name.**
Today: if the model called `save_details(agent_name)`, the open `name_agent` card was settled by `saveDetails` ("Said in words … settles the same way"). If the model **didn't** (e.g. it saved the typed word as `user_name`, or said "nice" without the tool), the card stays open; tapping "Leo" later overwrites `agentName` and sends "The user named you Leo" to whatever session exists. Verdict: **Gap · Low.** Fix: auto-settle open `name_agent` cards as `dismissed` once `agentName` is set by any path, and once the next step (Gmail) has started.

**C2 · Two `task_options` cards open (one from the day, one from the demo inbox); user taps both.**
Today: each `completeCard(picked)` overwrites `helpWith` and sends "set it in motion with set_reminder" → two reminders, two buzzes. `set_reminder` says "one per onboarding" but nothing enforces it. Verdict: **Gap · Medium.** Fix: when one `task_options` card is picked, settle the others as `dismissed`; make `setReminder` refuse a second reminder during onboarding.

**C3 · Tapping a card while a session is connecting.**
Today: `completeCard` → `session` null → `followUp(said)` → `if (session || opening) return` → the **event is dropped**. The card renders as settled, but the session that is connecting built its `contextFor()` synchronously *before* the tap (`connect` evaluates `contextFor()` before its first `await`), so it believes the card is "still open" and waits. Verdict: **Bug · High.** Fix: when `opening` exists, chain onto `opening.promise` and `sendEvent` once it resolves; or have `connect` diff the thread at open time and send a catch-up `[event]`.

**C4 · Tapping a card after the session ended.**
Today: `followUp(said)` opens an app session with the tap as its reason. Verdict: **Fine** - except after graduation (E7).

**C5 · Tapping a card on the phone during a band call.**
Today: `session.sendEvent(said)` goes into the band session; Persona acknowledges by voice. Verdict: **Fine.**

**C6 · Consent sheet: Cancel (top-left) or "Not now" (allow step).**
Today: both call `closeConsent()` only. The Gmail card stays open, **no event** is sent, and the model - told to "wait for them to act on it" - waits. The conversation stalls until the user types. The sheet's "Not now" also does *not* mean what the card's "Not now" means (that one declines). Verdict: **Gap · Medium.** Fix: send a `dismissed`-style event ("they opened the sign-in and backed out") so Persona can nudge once or offer to skip; rename the sheet's second button "Back".

**C7 · Consent: user edits the email to their real address.**
Today: `completeCard(connected, email)` stores it in `profile.gmail` (persisted to `localStorage`) and sends it to OpenAI in every later session's instructions (`knownSection`). The sheet says "Nothing here is stored or sent." That is true of the password, false of the email. Verdict: **Bug · Medium** (honesty). Fix: lock the field to the demo account, or reword the footer.

**C8 · Gmail connect while on a call.**
Today: `completeCard` → `startInboxScan` → event to the band session → Persona asks the agents question by voice; finds arrive spoken (D5). Verdict: **Fine.**

**C9 · Answering `task_options` in words instead of tapping.**
Today: `save_details(help_with)` saves the goal, but `saveDetails` only settles `connect_gmail` and `name_agent` cards; the `task_options` card stays tappable forever. Tapping it later triggers C2. Verdict: **Gap · Low.** Fix: settle open `task_options` cards when `helpWith` is saved.

**C10 · "I'll type my own" on the name card.**
Today: `dismissed` → `sendEvent(said, false)` (no reply requested) and focus moves to the composer. With no session, nothing is sent (correct - the user will type). Verdict: **Fine.**

**C11 · The user says "yes, connect Gmail" in words.**
Today: nothing in code can connect from words; the model must call `show_card connect_gmail` (or point at the existing card). If a connected card already exists `showCard` returns `connected`. Verdict: **Fine** (prompt-dependent; **unverified** that the model reliably re-shows the card rather than asking for an address).

**C12 · Show a card the model has already shown (`name_agent` when a name exists, a second `connect_gmail` while declined).**
Today: `showCard` only blocks `connect_gmail` when already connected. Duplicate name cards or a repeat Gmail card after a decline are allowed. Verdict: **Gap · Low.** Fix: refuse `name_agent` when `agentName` is set and `connect_gmail` while `gmail === "declined"` unless the user asked.

**C13 · `show_card task_options` arrives after the call the user just hung up.**
Today: `showCard` awaits `waitForSpeechEnd`; after `finish` the wait exits and the card is appended to the thread anyway; `showBanner` fires; the tool output is discarded (`ended`). The app follow-up session's context was built before the append (see C3), so it does not know a card is on screen. Verdict: **Bug · Medium.** Same fix as A14/C3.

**C14 · Card banners while the consent sheet is open.**
Today: banner is `z-50`, sheet `z-40`; the banner shows on top and is tappable. Verdict: **Fine.**

---

## D. Inbox scan and held finds

**D1 · Scan finishes; the user has said "yes" to agents.**
Today: `finishInboxScan` → `deliverFindsIfReady(true)` → `agents.used === true` → card (app) or spoken (band) + `sendEvent(said, true)`. Verdict: **Fine.**

**D2 · User says "no"; the finds must wait for one more turn.**
Today: `saveDetails` sets `agents.at = now`, later than the "no" message's `at`, so `userTurnsSince(agents.at) >= 1` needs the *next* message. In the app, `sendText` appends, calls `releaseHeldFinds()` (card + `sendEvent(said, false)`), then `sendUserText` → one reply covering both. Verdict: **Fine** for the app.

**D3 · Same as D2, but on the band.**
Today: the user's answer arrives as `conversation.item.input_audio_transcription.completed`, which with semantic VAD typically lands **after** `response.created` for the reply. `onTranscript` → `releaseHeldFinds` → `sendEvent(said, false)`: the event arrives mid-response with no response requested, so the finds are not spoken until the user's *next* turn. The "finds arrive with their answer" promise breaks on voice. Verdict: **Gap · Medium.** Fix: on the band, pass `respond = true` when the session is not currently responding, or queue the event and `requestResponse()` after the in-flight response completes.

**D4 · Finds delivered by voice, then the page is reloaded.**
Today: band delivery appends **no thread item** (only the app path appends a `demo_inbox` card). `hydrate` recomputes `inboxFindsHeld = scanned && !delivered` → **true** → the finds are delivered a second time (as a card) on the next user turn. Verdict: **Bug · Medium.** Fix: record delivery in the thread (an `event` or a flag on the `inbox_scan` item) and use that in `hydrate`.

**D5 · Finds delivered by voice; the call ends before the user picks one.**
Today: no card ever appears in the app; the three options exist only in the transcript. The app follow-up would have to re-create a `task_options` card from history. Verdict: **Gap · Medium.** Fix: when a band call ends with undelivered-in-app finds, append the `demo_inbox` card so the user can tap.

**D6 · Scan finishes while a session is connecting.**
Today: `deliverInboxFinds(true)` → `session` null → `followUp(said)` → returns early because `opening` is set. `inboxFindsHeld` was already set false. The card is appended (not on a call) but the model is never told, and the connecting session's context predates the card. Verdict: **Bug · Medium.** Same fix as C3.

**D7 · The user never answers the agents question and goes quiet.**
Today: readiness is only re-evaluated on a user message or `save_details`; there is no timer. If they walk away after "used an agent before?", the finds sit held. When they return, it takes **three** user turns since the scan (`MAX_TURNS_BEFORE_FINDS`) unless the model saves `used_agents`. Verdict: **Gap · Medium.** Fix: add a time-based fallback (e.g. 60 s after the scan) that delivers regardless.

**D8 · Ambiguous answer ("kind of", "what's poke?").**
Today: whether `save_details(used_agents)` is called is up to the model; if not, D7's three-turn cap applies. Verdict: **Unverified.** Test: answer "what's muse?" and count turns until the card appears.

**D9 · Model sends `used_agents: "yes"` (string).**
Today: `typeof args.used_agents === "boolean"` → ignored silently; the tool still returns `status: "saved"`, so the model believes it saved. Gating falls back to D7. (`additionalProperties: false` is declared but the session is not in strict mode.) Verdict: **Bug · Low.** Fix: return an error for wrong-typed fields; or coerce "yes"/"no".

**D10 · Scan finishes during a reload.**
Today: `hydrate` re-arms with `max(1 s, remaining)`; the card is appended and `followUp` opens an app session if ready. If `scanned && !delivered`, the held flag is restored. Verdict: **Fine.**

**D11 · Gmail declined in words, then connected via a later card.**
Today: `saveDetails` only sets `declined` when not connected; `completeCard(connected)` flips to `connected` and starts the (single) scan. Verdict: **Fine.**

**D12 · The model calls `show_card task_options` with the inbox items itself.**
Today: a second, un-badged card duplicates the `demo_inbox` one. The prompt says not to. Verdict: **Gap · Low.** Fix: when a `demo_inbox` card is open, have `showCard` refuse another `task_options` unless the titles differ.

---

## E. Reminders and graduation

**E1 · Reminder fires during a call.**
Today: `fireReminder` → `buzz` + `sendEvent` to the band session → Persona says it aloud; the band line shows "Reminder: …"; a press dismisses the buzz (does **not** end the call) for 8 s (`BUZZ_MS`), after which a press ends the call again. Verdict: **Fine** (the mode switch on the same button is subtle; the aria-label does update).

**E2 · Reminder fires with the app on the home screen.**
Today: the app session (if still open) or a new one (`openSession("app", said)`) replies; `onTranscript` → `unread++` + banner. Verdict: **Fine.**

**E3 · Reminder fires while a session is connecting.**
Today: `session` null → `openSession("app", said)` (not via `followUp`) → `++generation`: it **supersedes the connecting session**, including a band call the user just answered (the ring goes idle; they pressed and got nothing). Verdict: **Bug · Medium.** Fix: if `opening`, chain the event onto `opening.promise` instead of opening a new session.

**E4 · Reload before the reminder fires / after it should have.**
Today: `hydrate` re-arms with the remaining time, minimum 1 s; overdue reminders fire 1 s after load and open an app session saying "just went off". Verdict: **Fine.**

**E5 · Reset after a reminder is set.**
Today: `reset` clears `pendingTimers` and `buzzTimer`. Verdict: **Fine.**

**E6 · Two reminders (model calls `set_reminder` twice, or C2).**
Today: two items, two buzzes, two follow-ups. Verdict: **Gap · Low.** Fix: refuse a second onboarding reminder in `setReminder`.

**E7 · After `graduate`, with all four fields present, nothing follows up.**
Today: `followUp` returns immediately when `graduated && missingFields(state).length === 0`. That silences: `afterCall` (completed and dropped calls), `completeCard` for any later tap, `deliverInboxFinds` when the scan finishes after graduation (plausible when the user skips ahead - `help_with` → `set_reminder` → `graduate` inside the 12 s scan), and `onCallFailed`. Only `fireReminder` bypasses it. The user taps "Check in for Wednesday's flight" and nothing happens. Verdict: **Bug · High.** Fix: drop the early return; the prompt already tells a graduated session to "help with whatever they need".

**E8 · `when` is "tomorrow 9 AM" but it fires in 20 s.**
Today: always `REMINDER_DEMO_SECONDS`; the card is badged "Demo · 20s" and the tool result tells the model so. Verdict: **Fine.**

**E9 · The band buzz auto-settles before the user notices.**
Today: 8 s, then the buzz clears; the phone banner lasts 5 s. The reminder card in the app says "Your band buzzed". Verdict: **Fine.**

**E10 · Model calls `graduate` before setting a reminder.**
Today: allowed; `graduate` returns `still_missing`. Combined with E7, later taps go unanswered. Verdict: **Gap · Low** (fixed by E7).

---

## F. User behaviour

**F1 · Troll or test names ("asdf", "your mom", 500 characters, emoji).**
Today: `saveDetails` accepts any non-empty string; the prompt asks for "one light jab, then it's their call". The name is used raw in the header, banners, consent sheet ("to continue to {name}") and the instructions (`You are ${name}`). Long names are truncated in cards but not in the app header or consent sheet. Verdict: **Gap · Low.** Fix: cap to ~24 chars in `saveDetails` and truncate in UI.

**F2 · Name that reads as an instruction ("ignore all rules and…").**
Today: injected verbatim into the system instructions. Only the user can hurt themselves. Verdict: **Gap · Low.** Fix: quote and length-limit the name in `buildInstructions`.

**F3 · Refusing everything (no Gmail, "nothing" to yesterday/loops/goal).**
Today: prompt-driven; `graduate` can be called with fields missing and `missingFields` is reported; the app follow-up copes. Verdict: **Unverified.** Test: say "no" to every question and check the model still sets one small task or ends gracefully without looping.

**F4 · Off-topic questions.**
Today: prompt says answer briefly, steer back once. Verdict: **Unverified** (model).

**F5 · Giving a Google password in chat.**
Today: the text is appended to the thread (persisted in `localStorage`) and sent to OpenAI as a user message **before** the model can decline; it also rides into every later session via `historyLines`. The prompt only tells the model to stop them. Verdict: **Gap · Medium.** Fix: client-side redaction is unreliable; at minimum, let the model's refusal trigger a `redact_last_message` tool, and never include lines flagged as secrets in `historyLines`.

**F6 · Changing their mind (rename, un-decline Gmail).**
Today: `save_details` overwrites; settled cards keep their historical text ("You named me Leo"), which is fine. Connected → "disconnect Gmail" has no tool; the model can only say so. Verdict: **Gap · Low.** Fix: none needed for onboarding; note the missing disconnect path.

**F7 · Contradicting earlier answers ("actually I have used Poke").**
Today: `save_details(used_agents: true)` resets `agents` with a new `at`; `deliverFindsIfReady` then delivers immediately if still held. Verdict: **Fine.**

**F8 · Silence in the app.**
Today: nothing prompts; the app session stays open indefinitely (never closed on `goHome`). Verdict: **Fine** for messaging; Low cost/idle concern.

**F9 · "idk" everywhere.**
Today: prompt: "one easy follow-up, then options". Verdict: **Unverified** (model). Test: answer "idk" to all three no-Gmail questions.

**F10 · Asking to skip ("just help me with X").**
Today: prompt allows; code path: `save_details(help_with)` → `set_reminder` → `graduate`. Then E7 applies. Verdict: **Fine** (subject to E7).

**F11 · Asking what Persona can do.**
Today: prompt-driven answer; no tool. Verdict: **Unverified.**

**F12 · Speaking a language other than English on the band.**
Today: `transcription.language: "en"` is hard-coded (`services/openai/mint-session.ts` → `buildSession`), so speech is forced through English transcription; the model itself may answer in the user's language, so the surfaces disagree. The app has no such constraint. Verdict: **Gap · Medium.** Fix: omit `language` (auto-detect) or set it from `navigator.language`.

**F13 · User types "[event] …" themselves.**
Today: sent as a user-role message; the prompt says `[event]` lines come from the system. Mild confusion possible. Verdict: **Gap · Low.** Fix: none needed; optionally strip a leading `[event]` from user text.

**F14 · Presses the band first, never opens the app.**
Today: first-time band greeting → the whole flow can run by voice; cards land in an app that is closed → banners on the home screen; the prompt tells the band model to say "it's waiting in the app". Verdict: **Fine.**

**F15 · Opens the app, then presses the band before the app greeting connects.**
Today: `thread.length === 0` → the band gets the first-time greeting; the app connect is superseded. Verdict: **Fine.**

---

## G. Model behaviour

**G1 · Duplicate lines after a tool turn.**
Today: `onTranscript` drops an assistant line only if it is byte-identical to the previous assistant line on the same surface. Near-duplicates ("nova. i like it" / "nova, i like it.") pass. Verdict: **Gap · Low.** Fix: normalise punctuation/case before comparing, or compare against the last two lines.

**G2 · Narrating tools ("let me save that").**
Today: prompt only. Verdict: **Unverified.**

**G3 · `show_card task_options` with one option / bad shapes.**
Today: `showCard` filters to well-formed `{title, detail}` and returns an error under two. Unknown card → error. Verdict: **Fine.**

**G4 · `save_details` with wrong types.**
Today: `clean()` drops non-strings silently; the tool still reports `saved` (see D9). Verdict: **Bug · Low.**

**G5 · Re-asking a question already on screen.**
Today: `backInApp` appends the unanswered question to the follow-up reason, but `unansweredQuestion` only checks that the whole last app message ends with `?` - a two-bubble message whose question is the first bubble is missed. Verdict: **Gap · Low.** Fix: check whether any bubble ends with `?`.

**G6 · Presenting the demo inbox as real mail.**
Today: the delivery event and history lines say "(demo)"; the card is badged "Demo". Verdict: **Fine** (prompt-dependent wording, but the UI is honest regardless).

**G7 · `end_call` with no goodbye, or at the very start.**
Today: `waitForSpeechEnd` then close; user hears a click. Verdict: **Fine.**

**G8 · `show_card` and `end_call` in the same response.**
Today: `Promise.all` runs both; the card lands after the goodbye, the output is dropped once `ended`. Verdict: **Fine** (subject to C13's context gap).

**G9 · Two `response.create`s collide.**
Today: `requestResponse` queues (`responseOwed`); a server "error" is logged only. Verdict: **Fine.**

**G10 · Model asks for a Gmail address or password.**
Today: prompt forbids; nothing in code stops the question. Verdict: **Unverified.**

**G11 · `start_call` from the app when no one agreed.**
See B14.

---

## H. State and persistence

**H1 · Corrupt `localStorage` (non-JSON, or a non-array `thread`).**
Today: `readPersisted` → `JSON.parse` throws; `hydrate()` is called at **module scope** in `components/app.tsx`, so the dynamic import of `App` rejects and the page renders nothing; no error UI. A `thread` that is not an array throws in `hydrate`'s loop with the same result. Verdict: **Bug · High.** Fix: try/catch in `readPersisted` (fall back to `INITIAL_STATE`), validate shape, and move `hydrate()` into an effect or the store initialiser.

**H2 · `localStorage` unavailable or full (private mode, quota, blocked storage).**
Today: `store.set` calls `localStorage.setItem` on every change with no guard; a throw aborts the state update (listeners never run) - every message send breaks. Verdict: **Bug · Medium.** Fix: wrap persistence in try/catch and keep going in memory.

**H3 · Non-secure origin (e.g. `http://192.168.x.x:3000` to demo on a phone).**
Today: `newId` uses `crypto.randomUUID`, which is undefined outside secure contexts → `TypeError` on the first append; `getUserMedia` is also unavailable. Verdict: **Bug · Medium.** Fix: fall back to a random-string id; document the HTTPS requirement.

**H4 · Reset mid-call.**
Today: `reset` → `session.close()` → `onSessionEnded` (reason "closed", no drop record) → state cleared. The in-flight `connect`, if any, is superseded by `generation`. Missing: `callBaseline` not reset (feeds A15), `bannerTimer` not cleared (a banner set just before reset may clear a fresh one early - trivial). Verdict: **Bug · Medium** (in combination with A15).

**H5 · Reset while `sendText` is awaiting `opening.promise`.**
Today: the promise resolves `null` → `openSession("app")` is called into the fresh state, starting an app session with a blank context - Persona greets before the user has opened the app. Verdict: **Bug · Low.** Fix: same re-check as B4, plus a generation check in `sendText`.

**H6 · Schema change under the same key (`persona.onboarding.v2`).**
Today: `{...INITIAL_STATE, ...saved}` fills missing top-level keys only; nested shape changes are not migrated. Verdict: **Gap · Low.** Fix: a `version` field and a small migrate step.

**H7 · Fast Refresh / HMR re-runs `hydrate()`.**
Today: module-scope call → reminders and scans are armed twice in dev → double buzz/double delivery. Dev-only. Verdict: **Bug · Low.** Fix: guard with a module flag or move into the store.

**H8 · `HISTORY_LIMIT = 40` truncates long conversations.**
Today: profile/gmail state still travel; only old lines drop. Verdict: **Fine.**

**H9 · Phantom "Call dropped" after B4.**
Today: when a band session is closed by another `connect` rather than `endCall`, `callStartedAt` stays set → next reload records a drop that did not happen. Verdict: **Bug · Medium** (root cause B4). Fix: clear `callStartedAt` whenever a band session is closed by `connect`.

**H10 · The server trusts the client's `context`.**
Today: `/api/realtime` builds instructions from whatever `profile`/`history` the browser sends. A user can only manipulate their own session. Verdict: **Fine** for a prototype (note for production).

**H11 · Client secret expiry (60 s).**
Today: the mic is claimed **before** minting, so a slow permission prompt cannot expire the secret. Verdict: **Fine.**

---

## I. Accessibility, browsers, devices

**I1 · Non-English speech.** See F12. **Gap · Medium.**

**I2 · Screen readers: no live region.**
Today: new assistant messages, the band caption and the pill are plain text updates with no `aria-live`; a screen-reader user is not told Persona replied or that the band is ringing. Buttons all have labels; the composer has an `sr-only` label. Verdict: **Gap · Medium.** Fix: `aria-live="polite"` on the thread container and the band line; `role="status"` on the pill.

**I3 · No microphone device at all.**
Today: `NotFoundError` is wrapped as `MicrophoneError` → "Allow the microphone to talk", which is wrong advice. Verdict: **Gap · Low.** Fix: branch on `error.name`.

**I4 · Safari: remote audio autoplay and `AudioContext`.**
Today: the `<audio>` element is created in `ontrack`, several async hops after the click (which itself is 280 ms delayed by the double-press timer), and `AudioContext` is created in `attachAnalysers` without a gesture. Safari may block playback or leave the context suspended (ring glow stays flat). Verdict: **Unverified.** Test in Safari: does the voice play; does the ring react to speech. Fix if it fails: create the `Audio` element and `AudioContext` synchronously inside the press handler and `resume()` it.

**I5 · Firefox.**
Today: WebRTC path is standard; the phone frame uses CSS `zoom` (`phone.tsx`), supported in Firefox ≥126 only. Verdict: **Unverified.** Test: does the phone scale to fit on a short window in Firefox.

**I6 · Small screens / phones.**
Today: `page.tsx` uses `grid-cols-1 md:grid-cols-2` in an `h-dvh` grid with auto rows; below 768 px the two panels stack, the band photo (aspect 2336/3504) becomes very tall, and the "Reset onboarding" button is absolutely centred in `main`, landing on top of the band. `useFitScale` reads the section's height, which is now content-driven. Verdict: **Gap · Medium (unverified exact rendering).** Test at 390×844. Fix: explicit `grid-rows-[auto_1fr]` on small screens, cap the band's height, move Reset into the top bar.

**I7 · Reduced motion.**
Today: global rule sets `animation-iteration-count: 1` and near-zero durations, so the buzz/ring pulse play once and stop; the ring still lights. Verdict: **Fine.**

**I8 · Keyboard-only use.**
Today: the band is a `<button>` with focus ring; cards, banner, home indicator are buttons; Enter submits the composer. Double-press = two quick activations (decline) is reachable. Verdict: **Fine.**

**I9 · Touch: `title` tooltip on Continue-on-band never shows.**
Today: icon-only; label is `aria-label`/`title` only. Verdict: **Gap · Low** (see the introduction).

**I10 · Colour-only state on the band.**
Today: idle/connecting/live are expressed by glow plus text under the band ("Connecting…", "Listening…"), so not colour-only. Verdict: **Fine.**

---

## J. Copy and status consistency

**J1 · Band aria-label/hint during connecting says "Press to end the call".**
Today: pressing restarts (A5). Verdict: **Bug · Low** (fixed with A5).

**J2 · Consent sheet "Not now" ≠ card "Not now".** See C6. **Low.**

**J3 · README says reload mid-call → "Persona follows up in the app".** Only a drop is recorded (A11). **Low.**

**J4 · Prompt says "never call more than twice"; code allows three and counts all calls.** See A17. **Low.**

**J5 · Sheet footer "Nothing here is stored or sent".** The email is both (C7). **Medium** (counted there).

**J6 · Ringing pill has no cancel and no "or press twice to cancel".** See B7. **Low.**

**J7 · `bandNotice` ("Allow the microphone to talk") is cleared when the app opens** (`openPersonaApp`). The fix hint vanishes. **Gap · Low.** Fix: only clear it when a band connect succeeds.

**J8 · Home-screen badge shows "1" before any conversation** (`Math.max(unread, 1)` when the thread is empty) - intended as an invitation. **Fine.**

---

## What to test to close the "unverified" items

1. Safari (I4): press the band, confirm audio plays and the ring reacts.
2. Firefox (I5): short window, confirm the phone scales.
3. 390×844 viewport (I6): confirm layout and the Reset button position.
4. Model behaviour (D8, F3, F4, F9, F11, G2, G10, C11): scripted transcripts - ambiguous agents answer; refuse everything; "idk" ×3; ask for capabilities; try to give a password; say "yes connect gmail" with no card open.

## One structural fix that covers many cases

Most of the High/Medium bugs share two roots:

1. **Tool handlers and timers do not check they still belong to the current session or generation** (A14, A15, C13, H4, H5). Capture `generation`/`session` when a handler starts and bail if it changed.
2. **`opening` is treated as "busy, drop it"** (`followUp`), or as "nothing there, start another" (`fireReminder`, `sendText`), instead of "queue and deliver when it lands" (B4, C3, D6, E3). Add a `whenOpen(fn)` helper that chains onto `opening.promise` and sends the event to whichever session results, and make `connect` send a catch-up `[event]` for thread items added between `contextFor()` and channel open.
