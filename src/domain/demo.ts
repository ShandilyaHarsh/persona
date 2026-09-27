/**
 * Everything the prototype simulates, in one place, so none of it can be
 * mistaken for the real thing: the Google account the vault is prefilled
 * with, the inbox Persona "reads", and how much a demo reminder compresses
 * time.
 */

/** This prototype tests the onboarding, not Google OAuth. */
export const DEMO_GOOGLE_ACCOUNT = {
  email: "persona.demo@gmail.com",
  password: "demo-password",
} as const;

/** Something in the inbox Persona can act on, and the offer it makes about it. */
type DemoSignal = {
  subject: string;
  /** As a task they can tap. */
  title: string;
  /** What Persona offers to do, said the way it would say it. */
  offer: string;
};

/**
 * The inbox Persona looks at right after Gmail connects. Invented, labelled as
 * a demo wherever it appears, and never presented as the user's real mail.
 * Each thread is something Persona can do something about - that's the point.
 */
export const DEMO_INBOX = {
  signals: [
    {
      subject: "Your trip to San Francisco - Wed, 7:40 AM",
      title: "Check in for Wednesday's flight",
      offer: "you've got a flight wednesday morning - want me to check you in the second it opens?",
    },
    {
      subject: "You're registered - race day is Oct 11",
      title: "Plan your long runs for Chicago",
      offer: "you're running chicago in two weeks - want me to line up your long runs?",
    },
    {
      subject: "Adobe, Headspace, Peloton - $64/mo, unused in 60+ days",
      title: "Cancel 3 subscriptions you don't use",
      offer: "you're paying $64 a month for 3 things you haven't opened in two months - want me to cancel them?",
    },
  ] satisfies DemoSignal[],
} as const;

/**
 * How long going through the demo inbox takes. Long enough that Persona has a
 * moment to ask something while it works; short enough that nobody waits.
 */
export const INBOX_SCAN_SECONDS = 12;

/**
 * A reminder set for "6 PM" fires this many seconds after it's set, so the
 * band can visibly buzz while the demo is still on screen.
 */
export const REMINDER_DEMO_SECONDS = 20;
