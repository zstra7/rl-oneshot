import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("the AI-controlled opponent car moves on its own once a match is live", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  const before = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-opponent"));
  expect(before).toBeTruthy();

  // Let the live match run for a couple of real seconds without any human
  // input at all -- only the AI is driving car-opponent.
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-opponent"));
  expect(after).toBeTruthy();

  const displacement = Math.hypot(
    after!.position.x - before!.position.x,
    after!.position.z - before!.position.z
  );

  expect(displacement).toBeGreaterThan(1);
  expect(Number.isFinite(after!.position.x)).toBe(true);
  expect(Number.isFinite(after!.position.y)).toBe(true);
  expect(Number.isFinite(after!.position.z)).toBe(true);
});

test("the AI does not move before GO and stays idle through countdown", async ({ page }) => {
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
  });

  const state = await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState());
  expect(state?.matchState).toBe("COUNTDOWN_3");

  const before = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-opponent"));
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.advanceGameTicks(300)); // still mid-countdown
  const after = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-opponent"));

  const displacement = Math.hypot(
    after!.position.x - before!.position.x,
    after!.position.z - before!.position.z
  );
  expect(displacement).toBeLessThan(1);
});
