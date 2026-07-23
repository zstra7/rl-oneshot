import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("main menu shows CREDITS, and clicking it reaches CREDITS with the panel visible", async ({
  page
}) => {
  await expect(page.getByTestId("open-credits")).toBeVisible();
  await page.getByTestId("open-credits").click();

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState()))
    .toBe("CREDITS");
  await expect(page.getByTestId("credits-panel")).toBeVisible();
});

test("credits screen attributes the car model to spatka with the CC BY 4.0 licence and Sketchfab source", async ({
  page
}) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCredits());
  const panel = page.getByTestId("credits-panel");
  await expect(panel).toBeVisible();

  await expect(panel).toContainText("PSX style Pontiac Ventura 1977's");
  await expect(panel).toContainText("spatka");

  // The licence link points at the CC BY 4.0 deed and the source link at the
  // Sketchfab model page — both required to satisfy the licence's attribution
  // terms in a distributed build.
  await expect(
    panel.locator('a[href="https://creativecommons.org/licenses/by/4.0/"]')
  ).toBeVisible();
  await expect(
    panel.locator(
      'a[href="https://sketchfab.com/3d-models/psx-style-pontiac-ventura-1977s-8a63069b223e4ab88bac635d886559c7"]'
    )
  ).toBeVisible();
});

test("BACK returns to MAIN_MENU", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openCredits());
  await expect(page.getByTestId("credits-panel")).toBeVisible();

  await page.locator("[data-menu-back]").click();

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState()))
    .toBe("MAIN_MENU");
  await expect(page.getByTestId("main-menu")).toBeVisible();
});
