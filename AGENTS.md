<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repo

A web prototype of Persona's onboarding: a wrist band you press to talk (left) and
a phone running the Persona app you text in (right). One conversation, two
surfaces, OpenAI Realtime underneath, everything persisted in the browser. The
architecture is drawn in [docs/architecture.md](docs/architecture.md); read it
before changing how sessions, calls or cards flow.

The bar for every change: **would a world-class engineer write this, and could a
new reader understand it in one pass?**

## Structure

```
src/
  app/            Routes only: pages, layouts, the API route. No logic beyond wiring.
  components/     React UI, grouped by surface: band/, phone/, decisions/, shell/.
                  Components read state and call the conductor; they never talk
                  to OpenAI or localStorage directly.
  domain/         Pure types, data and functions: the onboarding record, demo data.
                  No side effects, no React, no browser APIs.
  services/
    conductor/    Client-side orchestration: who holds the conversation, calls,
                  cards, inbox scan, reminders. The only writer of app state.
    openai/       Everything that talks to OpenAI: minting sessions (server),
                  the WebRTC session (client), the prompt and the tool belts.
  lib/            Small generic utilities with no product knowledge (the store).
e2e/              Playwright end-to-end tests.
docs/             Architecture, edge cases.
```

Layer rules. Break one only with a comment explaining why.

- `app/` → `components/` → `services/conductor` → `services/openai` and `domain/`.
- `domain/` imports nothing from the other layers.
- Server-only code (`services/openai/mint-session.ts`, the API route) never
  imports client code, and it never ships the API key to the client.
- One home per concept. Before writing a helper, search for an existing one;
  extend it rather than duplicate it.

## Code habits

- **Names say what, comments say why.** Don't comment what the code already says.
  A comment earns its place by explaining a decision, a constraint, or a trap.
- **Small modules with one job.** If a file needs a table of contents, split it.
  Name files after the concept they hold (`calls.ts`, `inbox.ts`), not after the
  kind of thing they contain (`utils.ts`, `helpers.ts`).
- **Delete, don't comment out.** No dead code, unused exports, orphaned files or
  "just in case" parameters. Git remembers.
- **Constants are named and live at the top** of the module that owns them, with
  units in the name (`RING_TIMEOUT_MS`).
- **Type the boundaries, infer the rest.** Explicit types on exports and on data
  crossing a boundary (storage, network, tool arguments); let TypeScript infer
  locals. No `any`; narrow `unknown` where data enters.
- **Match the surrounding code.** Naming, comment density, file layout and
  idioms follow what is already there.

## Errors

- **Catch only where you can do something meaningful**, at a real boundary:
  the network, `localStorage`, `JSON.parse` of stored or remote data, media
  devices. Don't wrap code that can't throw, and don't catch just to rethrow.
- **Never swallow.** A caught error is handled visibly (the user sees a simple
  message, or the conversation recovers) and logged with context. No empty
  `catch {}`.
- **No silent fallbacks.** If something is wrong, fail explicitly or report it.
  Don't paper over it with a default nobody will notice.
- **Users see plain words**, never raw errors or stack traces: "Couldn't connect.
  Try again."

## Tests

- **Prefer end-to-end tests** (Playwright, `e2e/`). They drive the real app the
  way a person does, and they prove what matters: the flow works.
- **Don't add tests that don't earn their keep.** No unit tests for trivial code,
  getters, types or copy. No tests that mock the thing under test.
- Add a unit test only for pure logic with many edge cases that is hard to reach
  from the UI, and put it next to the module it tests.
- Tests that need the OpenAI API are skipped when `OPENAI_API_KEY` is not set,
  never faked.

## Product rules that live in code

- **Persona's voice** is defined in `services/openai/prompt.ts`: short, human,
  no filler, no narrating tools, no em dashes. Change the prompt, not the output.
- **Deterministic before prompted.** When a step of the brief must happen, make
  the conductor guarantee it (or steer it through a tool result). Don't rely on
  the system prompt alone.
- **Stale work can't write.** Anything that awaits re-checks that its session
  still holds the conversation before touching state.
- **Ask before user-facing decisions** (copy, truncation, what a card does).

## UI

- Tailwind v4 tokens from `app/globals.css` (iOS type scale, colours). No
  one-off hex values or font sizes in components.
- One spacing system per surface, concentric radii, shadows for depth and
  borders for structure.
- Motion: springs with `bounce: 0`, press scale `0.96`, exits softer than
  enters. Multi-stage animations get a storyboard comment and named timing
  constants at the top of the file.
- Custom SVG icons live in `components/icons.tsx`. No icon libraries.

## Before you call it done

```bash
npx tsc --noEmit
npm run lint
npm run test:e2e          # needs the dev server's env; API flows need OPENAI_API_KEY
```

Then look at it in the browser. Typechecking proves the code compiles, not that
the feature works.
