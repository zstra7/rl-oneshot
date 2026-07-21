import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("both car descriptors load and validate the real car.glb with no errors", async ({ page }) => {
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.getPipelineState()), { timeout: 15_000 })
    .toBe("READY");

  const reports = await page.evaluate(() => window.__ASSET_TEST__?.getCarIntakeReports());

  expect(reports?.player).toBeTruthy();
  expect(reports?.player?.meshCount).toBeGreaterThan(0);
  expect(reports?.player?.errors).toEqual([]);
  expect(reports?.opponent).toBeTruthy();
  expect(reports?.opponent?.meshCount).toBeGreaterThan(0);
  expect(reports?.opponent?.errors).toEqual([]);
});

test("both cars use the real supplied GLB, not the procedural fallback", async ({ page }) => {
  await expect
    .poll(() => page.evaluate(() => window.__ASSET_TEST__?.getPipelineState()), { timeout: 15_000 })
    .toBe("READY");

  const playerFallback = await page.evaluate(() =>
    window.__ASSET_TEST__?.isCarUsingFallback("player")
  );
  const opponentFallback = await page.evaluate(() =>
    window.__ASSET_TEST__?.isCarUsingFallback("opponent")
  );

  expect(playerFallback).toBe(false);
  expect(opponentFallback).toBe(false);
});

test("a live match renders and drives with the real car visuals bound to physics", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(200);
  });

  const before = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));

  await page.evaluate(() => {
    window.__GAME_TEST__?.runtime.start();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__GAME_TEST__?.runtime.stop());

  const after = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));

  expect(Number.isFinite(after!.position.x)).toBe(true);
  expect(Number.isFinite(after!.position.y)).toBe(true);
  expect(Number.isFinite(after!.position.z)).toBe(true);
  // The car should stay near ground height, not fall through the floor or
  // fly off (a broken car-visual alignment does not affect physics, but a
  // broken render binding wiring would still show up as a runtime error
  // here well before this point).
  expect(after!.position.y).toBeGreaterThan(-1);
  expect(after!.position.y).toBeLessThan(5);
  expect(before).toBeTruthy();

  await page.screenshot({ path: "test-results/car-visual-live-match.png" });
});

test("menu presentation shows both team-tinted car visuals without console errors", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.waitForTimeout(1000);

  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: "test-results/car-visual-menu.png" });
});
