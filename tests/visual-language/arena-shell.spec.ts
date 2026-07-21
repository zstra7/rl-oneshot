import { expect, test } from "@playwright/test";

/** WS5.A (plan/POLISH_OVERHAUL_PLAN.md): transparent hex-pattern glass shell. */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);
});

test("the arena shell has at least 6 transparent glass meshes and the floor stays opaque", async ({ page }) => {
  const info = await page.evaluate(() => window.__ASSET_TEST__?.getStadiumShellInfo());
  expect(info).toBeTruthy();
  expect(info!.transparentMeshCount).toBeGreaterThanOrEqual(6);
  expect(info!.floorMaterialOpaque).toBe(true);
});

test("a live match with the glass shell renders with no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(120);
  });
  await page.waitForTimeout(200);

  expect(consoleErrors).toEqual([]);
});
