import { expect, test } from "@playwright/test";

/** WS5.A (plan/POLISH_OVERHAUL_PLAN.md): transparent hex-pattern glass shell. */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.ready() ?? false), { timeout: 15_000 })
    .toBe(true);
});

test("the arena shell has at least 30 transparent glass meshes and the floor stays opaque", async ({ page }) => {
  // R1 (plan/RAMPS_AND_FEATURES_PLAN.md): the 24 curved corner wall
  // panels use the same transparent glass material, raising the floor
  // from the original 6 (2 side walls + ceiling + 2 end-wall groups).
  const info = await page.evaluate(() => window.__ASSET_TEST__?.getStadiumShellInfo());
  expect(info).toBeTruthy();
  expect(info!.transparentMeshCount).toBeGreaterThanOrEqual(30);
  expect(info!.floorMaterialOpaque).toBe(true);
});

test("WS8.B: the floor is paneled with individually textured tiles", async ({ page }) => {
  const info = await page.evaluate(() => window.__ASSET_TEST__?.getStadiumShellInfo());
  expect(info).toBeTruthy();
  expect(info!.floorPanelCount).toBeGreaterThanOrEqual(20);
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
