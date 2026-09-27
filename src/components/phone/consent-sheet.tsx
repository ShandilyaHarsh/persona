"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { ChevronLeftIcon, InboxIcon, LockIcon, PenIcon, SendIcon } from "@/components/icons";
import { usePersonaName } from "@/components/use-persona-name";
import { cancelConsent, completeCard } from "@/services/conductor";
import { DEMO_GOOGLE_ACCOUNT } from "@/domain/demo";

/* ─────────────────────────────────────────────────────────
 * SECURE VAULT
 *
 * Where Gmail gets connected - opened from the Gmail card in the app. A web
 * page, not the conversation, because a password must never be typed into a
 * chat.
 *
 *   step 1   sign in to Google (email, password)
 *   step 2   review what Persona may do, then Allow
 *
 * Simulated, and says so: it arrives prefilled with a demo account, and the
 * password is held in this component's state for the length of the form and
 * never stored, logged or sent anywhere.
 * ───────────────────────────────────────────────────────── */

const SCOPES = [
  { icon: InboxIcon, text: "Read your email" },
  { icon: PenIcon, text: "Draft replies" },
  { icon: SendIcon, text: "Send email you approve" },
];

const STEP_SPRING = { type: "spring", duration: 0.35, bounce: 0 } as const;

export function ConsentSheet({ cardId }: { cardId: string }) {
  const name = usePersonaName();
  const [stage, setStage] = useState<"sign-in" | "allow">("sign-in");
  // The account is fixed: only the demo inbox exists, so connecting any other
  // address would claim access to mail Persona never sees.
  const email = DEMO_GOOGLE_ACCOUNT.email;
  const [password, setPassword] = useState<string>(DEMO_GOOGLE_ACCOUNT.password);
  const [touched, setTouched] = useState(false);
  const valid = password.length > 0;

  function signIn(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    setStage("allow");
  }

  return (
    <div className="flex size-full flex-col bg-black/35">
      <div className="mt-[54px] flex flex-1 flex-col overflow-hidden rounded-t-[14px] bg-white text-ink shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
        {/* Browser chrome: this is a web page on the vault, not part of the chat. */}
        <div className="flex items-center gap-2 border-b border-black/5 bg-[#f6f6f7] px-3 py-2">
          <button
            type="button"
            onClick={cancelConsent}
            className="min-h-9 px-1 text-body text-imessage transition-opacity duration-150 active:opacity-60"
          >
            Cancel
          </button>
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-black/5 py-1.5 text-footnote text-ink-muted">
            <LockIcon size={13} strokeWidth={2} />
            vault.persona · secure
          </span>
          <span className="w-[58px]" aria-hidden />
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {stage === "sign-in" ? (
            <motion.form
              key="sign-in"
              onSubmit={signIn}
              className="flex flex-1 flex-col px-6 pb-[42px] pt-8"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={STEP_SPRING}
            >
              <GoogleMark />
              <h2 className="mt-5 text-title2 font-semibold">Sign in to Google</h2>
              <p className="mt-1 text-subhead text-ink-muted">to continue to {name}</p>

              <label className="mt-7 flex flex-col gap-1.5">
                <span className="text-footnote font-medium text-ink-muted">Email</span>
                <input
                  type="email"
                  readOnly
                  value={email}
                  className="h-12 rounded-xl border border-line bg-well px-3.5 text-body text-ink-muted outline-none"
                />
              </label>
              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-footnote font-medium text-ink-muted">Password</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={touched && !valid}
                  className="h-12 rounded-xl border border-line px-3.5 text-body outline-none transition-colors duration-150 focus:border-imessage aria-[invalid=true]:border-critical"
                />
              </label>
              <p className={`mt-2 text-footnote text-critical ${touched && !valid ? "visible" : "invisible"}`}>
                Enter your password
              </p>

              <div className="mt-auto flex flex-col gap-3">
                <button
                  type="submit"
                  className="min-h-12 rounded-[14px] bg-ink text-body font-medium text-white transition-transform duration-150 ease-out-soft active:scale-[0.96]"
                >
                  Next
                </button>
                <p className="text-center text-caption2 leading-4 text-ink-faint">
                  A demo account with a demo inbox - this prototype doesn&apos;t sign in to Google. Nothing here is stored or sent.
                </p>
              </div>
            </motion.form>
          ) : (
            <motion.div
              key="allow"
              className="flex flex-1 flex-col px-6 pb-[42px] pt-6"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={STEP_SPRING}
            >
              <button
                type="button"
                onClick={() => setStage("sign-in")}
                className="-ml-2 flex min-h-9 w-fit items-center text-subhead text-imessage"
              >
                <ChevronLeftIcon size={20} strokeWidth={2} />
                {email}
              </button>
              <h2 className="mt-4 text-title2 font-semibold">{name} wants access to your Gmail</h2>

              <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-well p-4">
                {SCOPES.map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-3 text-subhead">
                    <Icon size={20} className="text-ink-muted" />
                    {text}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-footnote text-ink-muted">Nothing is sent without your OK. You can disconnect any time.</p>

              <div className="mt-auto flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => completeCard(cardId, { status: "connected", email })}
                  className="min-h-12 rounded-[14px] bg-ink text-body font-medium text-white transition-transform duration-150 ease-out-soft active:scale-[0.96]"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={cancelConsent}
                  className="min-h-12 text-body text-ink-muted transition-opacity duration-150 active:opacity-60"
                >
                  Not now
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A neutral four-colour mark - evokes Google sign-in without copying its logo. */
function GoogleMark() {
  return (
    <span className="flex gap-1" aria-hidden>
      {["#4285f4", "#ea4335", "#fbbc05", "#34a853"].map((color) => (
        <span key={color} className="size-2.5 rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}
