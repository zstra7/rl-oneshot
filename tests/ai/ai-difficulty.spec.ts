import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false), {
      timeout: 15_000
    })
    .toBe(true);
});

test("match setup shows EASY/MEDIUM/HARD difficulty buttons, medium selected by default", async ({
  page
}) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());
  await expect(page.getByTestId("match-setup")).toBeVisible();

  await expect(page.getByTestId("difficulty-easy")).toBeVisible();
  await expect(page.getByTestId("difficulty-medium")).toBeVisible();
  await expect(page.getByTestId("difficulty-hard")).toBeVisible();

  const difficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(difficulty).toBe("medium");
});

test("selecting a difficulty takes effect immediately on the live AI", async ({ page }) => {
  await page.evaluate(() => window.__GAME_TEST__?.gameFlow?.openMatchSetup());

  await page.getByTestId("difficulty-hard").click();
  let difficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(difficulty).toBe("hard");

  await page.getByTestId("difficulty-easy").click();
  difficulty = await page.evaluate(() => window.__GAME_TEST__?.runtime.getAiDifficulty());
  expect(difficulty).toBe("easy");
});

test("the opponent AI still drives itself and stays finite at hard difficulty through a live match", async ({
  page
}) => {
  await page.evaluate(() => {
    window.__GAME_TEST__?.runtime.selectAiDifficulty("hard");
    window.__GAME_TEST__?.gameFlow?.openMatchSetup();
    window.__GAME_TEST__?.gameFlow?.startMatch();
    window.__GAME_TEST__?.gameFlow?.advanceGameTicks(460);
  });

  const before = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-opponent"));
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => window.__PHYSICS_TEST__?.getCarState("car-opponent"));

  expect(Number.isFinite(after!.position.x)).toBe(true);
  expect(Number.isFinite(after!.position.y)).toBe(true);
  expect(Number.isFinite(after!.position.z)).toBe(true);

  const displacement = Math.hypot(
    after!.position.x - before!.position.x,
    after!.position.z - before!.position.z
  );
  expect(displacement).toBeGreaterThan(0.5);
});
