import { expect, test } from "@playwright/test";

test("plays a complete case at a 360px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible();
  await page.getByRole("textbox").fill("An astronomical dial vanished during a gallery reception.");
  await page.getByRole("button", { name: /OPEN CASE/ }).click();
  await expect(page).toHaveURL(/\/cases\//);
  await expect(page.getByRole("heading", { name: /Collected evidence/ })).toBeVisible({
    timeout: 20_000,
  });

  const typeFilter = page.locator("select.filter-select");
  for (const type of ["chat", "image", "cctv", "document", "statement"]) {
    await typeFilter.selectOption(type);
    const card = page.locator(".evidence-card").first();
    await expect(card).toBeVisible();
    await card.locator(".evidence-open").click();
    await expect(page.locator(".evidence-dialog")).toBeVisible();
    await page.locator(".evidence-dialog .close").click();
  }
  await typeFilter.selectOption("all");
  await page.getByRole("button", { name: /MAKE AN ACCUSATION/ }).click();
  await page.getByRole("button", { name: /Jonah Reed/ }).click();
  await page.getByRole("button", { name: /CONFIRM ACCUSATION/ }).click();
  await expect(page.locator(".toast")).toContainText("incorrect");
  await page.getByRole("button", { name: /MAKE AN ACCUSATION/ }).click();
  await page.getByRole("button", { name: /Mara Vale/ }).click();
  await page.getByRole("button", { name: /CONFIRM ACCUSATION/ }).click();
  await expect(page.getByRole("heading", { name: "The truth, at last." })).toBeVisible();
  await expect(page.getByText("THE TIMELINE")).toBeVisible();
});
