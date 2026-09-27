import { REMINDER_DEMO_SECONDS } from "@/domain/demo";
import { newId } from "@/domain/onboarding";
import { showBanner } from "./phone";
import { deliver } from "./sessions";
import { clearTimer, onboarding, patchLive, runtime, schedulePending } from "./state";
import { append } from "./thread";

/** How long the band buzzes for a reminder before it settles on its own. */
const BUZZ_MS = 8_000;

/** Put a reminder in the thread and arm it. Time is compressed for the demo. */
export function addReminder(task: string, when: string) {
  const id = newId();
  const firesAt = Date.now() + REMINDER_DEMO_SECONDS * 1000;
  append({ kind: "reminder", id, task, when, firesAt, fired: false, at: Date.now() });
  armReminder(id, task, firesAt);
}

export function armReminder(id: string, task: string, firesAt: number) {
  schedulePending(id, firesAt, () => fireReminder(id, task));
}

/** The first real task goes off: the band buzzes, the phone shows it, Persona follows up. */
function fireReminder(id: string, task: string) {
  onboarding.set((state) => ({
    ...state,
    thread: state.thread.map((item) => (item.kind === "reminder" && item.id === id ? { ...item, fired: true } : item)),
  }));
  clearTimer(runtime.buzzTimer);
  patchLive({ buzz: { id, task } });
  runtime.buzzTimer = setTimeout(() => patchLive({ buzz: null }), BUZZ_MS);
  showBanner(`Reminder: ${task}`);
  deliver(`The reminder you set just went off - their band is buzzing: "${task}". In one short line, nudge them and offer to help with it right now.`);
}
