import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

/**
 * R7 (plan/RAMPS_AND_FEATURES_PLAN.md): RL-style toxic quick-chat spam —
 * "CPU: WHAT A SAVE!" pops up three times when the opponent scores.
 */
test("opponent goal spams WHAT A SAVE! three times, then fades out", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.simulateGoal("opponent"));

  await expect(page.getByTestId("quick-chat-message")).toHaveCount(3, { timeout: 1500 });
  const texts = await page.getByTestId("quick-chat-message").allTextContents();
  for (const text of texts) {
    expect(text).toContain("WHAT A SAVE!");
  }

  await page.waitForTimeout(4000);
  await expect(page.getByTestId("quick-chat-message")).toHaveCount(0);
});

test("a player goal does not trigger quick chat", async ({ page }) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.simulateGoal("player"));
  await page.waitForTimeout(1000);

  await expect(page.getByTestId("quick-chat-message")).toHaveCount(0);
});

test("returning to menu with a pending spam is unmount-safe", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.evaluate(() => {
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.selectMatchDuration(1);
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
    window.__GAME_TEST__?.gameFlow?.simulateGoal("opponent");
  });

  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMainMenu());
  await page.waitForTimeout(4000);

  expect(pageErrors).toEqual([]);
  await expect(page.getByTestId("quick-chat-message")).toHaveCount(0);
});
