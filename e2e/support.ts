import type { Page } from "@playwright/test";

import { INITIAL_STATE, type OnboardingState, type ThreadItem } from "@/domain/onboarding";
import { STORAGE_KEY } from "@/services/conductor/state";

type Message = Extract<ThreadItem, { kind: "message" }>;

/** The Persona icon on the phone's home screen, with or without an unread badge. */
export const PERSONA_APP_ICON = /^Persona(, \d+ unread)?$/;

/**
 * Start the page from a saved record, the way a returning user would: write
 * it, then reload so the app hydrates from it. A record with a thread means
 * opening the app never mints a session.
 */
export async function loadWithRecord(page: Page, patch: Partial<OnboardingState>) {
  const record: OnboardingState = { ...INITIAL_STATE, ...patch };
  await page.goto("/");
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(record)] as const);
  await page.reload();
}

export async function readRecord(page: Page): Promise<OnboardingState | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as OnboardingState);
}

/** Persona's messages saved after the user's latest message with this text. */
export async function repliesAfter(page: Page, userText: string): Promise<Message[]> {
  const thread = (await readRecord(page))?.thread ?? [];
  const messages = thread.filter((item): item is Message => item.kind === "message");
  const asked = messages.findLastIndex((item) => item.role === "user" && item.text === userText);
  if (asked === -1) return [];
  return messages.slice(asked + 1).filter((item) => item.role === "assistant");
}

export function assistantMessage(text: string): Message {
  return { kind: "message", id: "seed-greeting", role: "assistant", text, via: "app", at: Date.now() };
}
