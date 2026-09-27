import { expect, test } from "@playwright/test";

import { assistantMessage, loadWithRecord, PERSONA_APP_ICON, readRecord } from "./support";

// Flows that never reach OpenAI. The first open of an empty app mints a
// session, so these start from a saved thread instead.

test("the prototype loads, and the decisions page is one tap away and back", async ({ page }) => {
  await page.goto("/");

  const band = page.getByRole("region", { name: "Persona Band" });
  const phone = page.getByRole("region", { name: "Phone" });
  await expect(band.getByRole("button", { name: "Press to call Persona" })).toBeVisible();
  await expect(phone.getByRole("button", { name: PERSONA_APP_ICON })).toBeVisible();

  await page.getByRole("link", { name: "Assumptions & decisions" }).click();
  await expect(page).toHaveURL("/decisions");
  const steps = page.getByRole("navigation", { name: "Onboarding steps" });
  await steps.getByRole("button", { name: /^(\d+[a-z]? )?Gmail / }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Gmail" })).toBeVisible();

  await page.getByRole("link", { name: "Prototype" }).click();
  await expect(page).toHaveURL("/");
  await expect(band.getByRole("button", { name: "Press to call Persona" })).toBeVisible();
});

test("Continue on band rings the band, and Cancel takes it back", async ({ page }) => {
  const realtimeRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/realtime")) realtimeRequests.push(request.url());
  });
  await loadWithRecord(page, { profile: { agentName: "Maya" }, thread: [assistantMessage("Good to meet you.")] });

  await page.getByRole("region", { name: "Phone" }).getByRole("button", { name: PERSONA_APP_ICON }).click();
  await expect(page.getByRole("log", { name: "Conversation with Maya" })).toContainText("Good to meet you.");

  const bandButton = page.getByRole("region", { name: "Persona Band" }).getByRole("button");
  const continueOnBand = page.getByRole("button", { name: "Continue on your band" });
  const pill = page.getByRole("status").filter({ hasText: "Press your band to start the call" });

  await continueOnBand.click();
  await expect(pill).toBeVisible();
  await expect(bandButton).toHaveAccessibleName("Press to answer, press twice to decline");
  await expect(continueOnBand).toBeDisabled();

  await pill.getByRole("button", { name: "Cancel" }).click();
  await expect(pill).toBeHidden();
  await expect(bandButton).toHaveAccessibleName("Press to call Maya");
  await expect(continueOnBand).toBeEnabled();
  expect(realtimeRequests).toEqual([]);
});

test("Reset onboarding clears everything Persona has learned", async ({ page }) => {
  await loadWithRecord(page, { profile: { agentName: "Maya", userName: "Sam" }, thread: [assistantMessage("Good to meet you, Sam.")] });
  const bandButton = page.getByRole("region", { name: "Persona Band" }).getByRole("button");
  await expect(bandButton).toHaveAccessibleName("Press to call Maya");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset onboarding" }).click();

  await expect(bandButton).toHaveAccessibleName("Press to call Persona");
  await expect(page.getByText("Tap to say hi.")).toBeVisible();
  const record = await readRecord(page);
  expect(record?.thread).toEqual([]);
  expect(record?.profile).toEqual({});

  // Still fresh after a reload: the reset was saved, not just rendered.
  await page.reload();
  await expect(bandButton).toHaveAccessibleName("Press to call Persona");
});
