import { expect, test } from "@playwright/test";

/**
 * F4 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): holding accelerate
 * through the countdown into "GO" must launch the car instantly. The
 * bug lived entirely in the live rAF frame path
 * (`GameRuntime.applyMenuNavigationGates`, called from `frame()`), which
 * `advanceGameTicks`/`stepFixedTicksForTesting` never exercises (it only
 * drives `onFixedTick` directly) — so this test deliberately does NOT
 * pause the runtime, unlike most other game-flow tests in this repo.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("holding accelerate through the countdown launches the car instantly at GO, without ever releasing", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(3);
    window.__GAME_TEST__?.gameFlow?.startMatch();
  });

  // Start holding W as early as possible (during the countdown) and never
  // release it — this is exactly the reported scenario.
  await page.keyboard.down("KeyW");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState().matchState), {
      timeout: 15_000
    })
    .toBe("PLAYING");

  // Within 0.75s of GO, still holding W the whole time, the car must be
  // moving at real speed -- not stuck waiting for a release+re-press.
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
        return Math.hypot(state!.linearVelocity.x, state!.linearVelocity.z);
      },
      { timeout: 750, intervals: [50] }
    )
    .toBeGreaterThan(2);

  await page.keyboard.up("KeyW");
});

test("holding accelerate + steer through the countdown also steers instantly at GO", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(3);
    window.__GAME_TEST__?.gameFlow?.startMatch();
  });

  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyA");

  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.getSessionState().matchState), {
      timeout: 15_000
    })
    .toBe("PLAYING");

  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-player"));
        return Math.abs(state!.angularVelocity.y);
      },
      { timeout: 1000, intervals: [50] }
    )
    .toBeGreaterThan(0.1);

  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyA");
});
