import { expect, test, type Page } from "@playwright/test";

import { PERSONA_APP_ICON, repliesAfter } from "./support";

// Talks to OpenAI Realtime for real. Model wording varies, so these assert on
// structure - bubbles, cards, that a reply arrived - never on exact text.
test.skip(!process.env.OPENAI_API_KEY, "needs OPENAI_API_KEY");

const MODEL_TIMEOUT_MS = 30_000;

/** Wait for Persona to answer the user's message, and for the answer to show in the app. */
async function expectReplyTo(page: Page, userText: string) {
  await expect.poll(async () => (await repliesAfter(page, userText)).length, { timeout: MODEL_TIMEOUT_MS }).toBeGreaterThan(0);
  const [reply] = await repliesAfter(page, userText);
  await expect(page.getByRole("log")).toContainText(reply.text);
}

test("text onboarding: name Persona, give your name, skip Gmail", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await page.goto("/");
  await page.getByRole("region", { name: "Phone" }).getByRole("button", { name: PERSONA_APP_ICON }).click();

  const log = page.getByRole("log");
  const nameChip = log.getByRole("button", { name: "Sam", exact: true });
  await expect(nameChip).toBeVisible();
  await nameChip.click();
  await expect(log.getByText("Sam", { exact: true })).toBeVisible();
  await expect(log.getByRole("button", { name: "Ava", exact: true })).toHaveCount(0);
  await expectReplyTo(page, "Sam");

  const composer = page.getByPlaceholder(/^Message/);
  await composer.fill("Harsh");
  await composer.press("Enter");
  await expect(log.getByText("Harsh", { exact: true })).toBeVisible();

  const notNow = log.getByRole("button", { name: "Not now" });
  await expect(log.getByRole("button", { name: "Connect Gmail" })).toBeVisible({ timeout: MODEL_TIMEOUT_MS });
  await notNow.click();
  await expect(log.getByText("Not now", { exact: true })).toBeVisible();
  await expect(notNow).toHaveCount(0);
  await expectReplyTo(page, "Not now");
});
